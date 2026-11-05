'use strict';
/* King File System — sandboxed workspace. Every path is resolved against the workspace root,
   symlink escapes are rejected, deletes go to a recoverable trash. */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { HttpError } = require('./util');
const audit = require('./audit');

const MAX_FILE = 5 * 1024 * 1024;
const IGNORED = new Set(['.git', 'node_modules', '.kingcode']);

class Workspace {
  constructor() { this.root = null; this.trashSeq = 0; this.undoStack = []; }

  async open(dir, { allowedRoots } = {}) {
    if (typeof dir !== 'string' || !dir || dir.includes('\0')) throw new HttpError(400, 'invalid workspace path');
    const abs = await fsp.realpath(path.resolve(dir)).catch(() => { throw new HttpError(404, 'workspace directory not found'); });
    const st = await fsp.stat(abs);
    if (!st.isDirectory()) throw new HttpError(400, 'workspace path is not a directory');
    if (allowedRoots && allowedRoots.length && !allowedRoots.some(r => abs === r || abs.startsWith(r + path.sep))) {
      throw new HttpError(403, 'workspace is outside the allowed roots', 'forbidden');
    }
    this.root = abs; this.undoStack = [];
    audit.log('workspace.open', { root: abs });
    return { root: abs };
  }

  need() { if (!this.root) throw new HttpError(409, 'no workspace is open', 'no_workspace'); return this.root; }

  /** Resolve a workspace-relative path; rejects traversal and symlink escapes. */
  async resolve(rel, { mustExist = false } = {}) {
    const root = this.need();
    if (typeof rel !== 'string' || rel.includes('\0') || path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new HttpError(400, 'invalid path', 'bad_path');
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) throw new HttpError(400, 'path escapes the workspace', 'bad_path');
    // Walk to the deepest existing ancestor and make sure its real path is inside root.
    let probe = abs;
    for (;;) {
      try { const real = await fsp.realpath(probe); if (real !== root && !real.startsWith(root + path.sep)) throw new HttpError(403, 'symlink escapes the workspace', 'bad_path'); break; }
      catch (e) { if (e instanceof HttpError) throw e; if (probe === root) break; probe = path.dirname(probe); }
    }
    if (mustExist) await fsp.lstat(abs).catch(() => { throw new HttpError(404, 'not found', 'not_found'); });
    return abs;
  }

  rel(abs) { return path.relative(this.need(), abs).split(path.sep).join('/'); }

  async tree(rel = '', { depth = 6, max = 5000 } = {}) {
    const base = await this.resolve(rel, { mustExist: true });
    let count = 0;
    const walk = async (dir, d) => {
      const out = [];
      let ents = await fsp.readdir(dir, { withFileTypes: true });
      ents.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
      for (const e of ents) {
        if (IGNORED.has(e.name)) continue;
        if (++count > max) break;
        const p = path.join(dir, e.name);
        if (e.isSymbolicLink()) { out.push({ name: e.name, path: this.rel(p), type: 'symlink' }); continue; }
        if (e.isDirectory()) out.push({ name: e.name, path: this.rel(p), type: 'dir', children: d > 1 ? await walk(p, d - 1) : [] });
        else if (e.isFile()) { const st = await fsp.stat(p); out.push({ name: e.name, path: this.rel(p), type: 'file', size: st.size }); }
      }
      return out;
    };
    return { path: this.rel(base), children: await walk(base, depth), truncated: count > max };
  }

  async read(rel) {
    const abs = await this.resolve(rel, { mustExist: true });
    const st = await fsp.stat(abs);
    if (!st.isFile()) throw new HttpError(400, 'not a file');
    if (st.size > MAX_FILE) throw new HttpError(413, 'file too large for the editor', 'too_large');
    const buf = await fsp.readFile(abs);
    if (buf.includes(0)) throw new HttpError(415, 'binary file', 'binary');
    return { path: this.rel(abs), content: buf.toString('utf8'), size: st.size, mtimeMs: st.mtimeMs };
  }

  /** Atomic write. If expectMtimeMs is given and the file changed on disk, refuse (conflict). */
  async write(rel, content, { expectMtimeMs } = {}) {
    if (typeof content !== 'string') throw new HttpError(400, '"content" must be a string');
    if (Buffer.byteLength(content) > MAX_FILE) throw new HttpError(413, 'content too large', 'too_large');
    const abs = await this.resolve(rel);
    if (abs === this.need()) throw new HttpError(400, 'invalid path');
    const existing = await fsp.stat(abs).catch(() => null);
    if (existing && existing.isDirectory()) throw new HttpError(400, 'path is a directory');
    if (existing && typeof expectMtimeMs === 'number' && Math.abs(existing.mtimeMs - expectMtimeMs) > 1) throw new HttpError(409, 'file changed on disk', 'conflict');
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    const tmp = abs + '.kc-' + process.pid + '-' + (++this.trashSeq) + '.tmp';
    await fsp.writeFile(tmp, content, { mode: existing ? existing.mode & 0o777 : 0o644 });
    await fsp.rename(tmp, abs);
    const st = await fsp.stat(abs);
    return { path: this.rel(abs), size: st.size, mtimeMs: st.mtimeMs };
  }

  async mkdir(rel) { const abs = await this.resolve(rel); await fsp.mkdir(abs, { recursive: true }); return { path: this.rel(abs) }; }

  async rename(from, to) {
    const a = await this.resolve(from, { mustExist: true }), b = await this.resolve(to);
    if (await fsp.lstat(b).then(() => true, () => false)) throw new HttpError(409, 'destination exists', 'exists');
    await fsp.mkdir(path.dirname(b), { recursive: true });
    await fsp.rename(a, b);
    this.undoStack.push({ kind: 'rename', from: this.rel(a), to: this.rel(b) });
    return { from: this.rel(a), to: this.rel(b) };
  }

  /** Move to .kingcode/trash instead of deleting; undo() restores. */
  async remove(rel) {
    const abs = await this.resolve(rel, { mustExist: true });
    if (abs === this.need()) throw new HttpError(400, 'cannot delete the workspace root');
    const slot = path.join(this.need(), '.kingcode', 'trash', Date.now() + '-' + (++this.trashSeq));
    await fsp.mkdir(slot, { recursive: true });
    const dest = path.join(slot, path.basename(abs));
    await fsp.rename(abs, dest);
    this.undoStack.push({ kind: 'delete', from: this.rel(abs), trash: dest });
    audit.log('fs.delete', { path: this.rel(abs) });
    return { path: this.rel(abs), undoable: true };
  }

  async undo() {
    const op = this.undoStack.pop();
    if (!op) throw new HttpError(409, 'nothing to undo', 'nothing');
    if (op.kind === 'rename') {
      const a = await this.resolve(op.to, { mustExist: true }), b = await this.resolve(op.from);
      if (await fsp.lstat(b).then(() => true, () => false)) throw new HttpError(409, 'original path is occupied', 'exists');
      await fsp.rename(a, b);
      return { restored: op.from };
    }
    const b = await this.resolve(op.from);
    if (await fsp.lstat(b).then(() => true, () => false)) throw new HttpError(409, 'original path is occupied', 'exists');
    await fsp.mkdir(path.dirname(b), { recursive: true });
    await fsp.rename(op.trash, b);
    return { restored: op.from };
  }

  /** Streaming change notifications. Returns a close() function. */
  watch(onEvent) {
    const root = this.need();
    let w;
    try {
      w = fs.watch(root, { recursive: true }, (type, name) => {
        if (!name) return;
        const first = String(name).split(path.sep)[0];
        if (IGNORED.has(first) || /\.kc-\d+-\d+\.tmp$/.test(String(name))) return;
        onEvent({ type, path: String(name).split(path.sep).join('/') });
      });
    } catch (e) { throw new HttpError(501, 'file watching is not supported here: ' + e.message, 'unsupported'); }
    return () => w.close();
  }
}

module.exports = { Workspace, MAX_FILE };
