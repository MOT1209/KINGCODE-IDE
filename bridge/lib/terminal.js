'use strict';
/* King Terminal — real shell sessions. On Linux/macOS with python3 a genuine PTY is allocated through
   lib/pty_helper.py (kind "pty": interactive programs, colours, resize). Without python3 (or on Windows)
   the session falls back to plain pipes (kind "pipe": no TTY, no full-screen apps). A native
   ConPTY backend for Windows is NOT implemented in the bridge. */
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const { HttpError } = require('./util');
const audit = require('./audit');

const MAX_SESSIONS = 8, BUFFER_LIMIT = 256 * 1024;
let pythonCache;
function python() {
  if (pythonCache !== undefined) return pythonCache;
  pythonCache = null;
  if (process.platform === 'win32') return pythonCache;
  for (const bin of ['python3', 'python']) {
    const r = spawnSync(bin, ['-c', 'import pty,os,termios;print(1)'], { timeout: 5000 });
    if (r.status === 0) { pythonCache = bin; break; }
  }
  return pythonCache;
}

function defaultShell() {
  if (process.platform === 'win32') return process.env.ComSpec || 'cmd.exe';
  return process.env.SHELL && path.isAbsolute(process.env.SHELL) ? process.env.SHELL : '/bin/sh';
}

class TerminalManager {
  constructor() { this.sessions = new Map(); }

  capabilities() { return { pty: !!python(), platform: process.platform, shell: defaultShell() }; }

  create({ cwd, cols = 80, rows = 24, shell } = {}) {
    if (this.sessions.size >= MAX_SESSIONS) throw new HttpError(429, 'too many terminal sessions', 'limit');
    cols = Math.max(10, Math.min(500, cols | 0)); rows = Math.max(2, Math.min(200, rows | 0));
    const sh = shell || defaultShell();
    const env = { ...process.env, TERM: 'xterm-256color', COLUMNS: String(cols), LINES: String(rows) };
    delete env.KINGCODE_TOKEN;
    const py = python();
    let cp, kind;
    if (py) {
      kind = 'pty';
      cp = spawn(py, [path.join(__dirname, 'pty_helper.py'), String(cols), String(rows), sh], { cwd, env, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
    } else {
      kind = 'pipe';
      cp = spawn(sh, [], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    }
    const id = crypto.randomBytes(6).toString('hex');
    const s = { id, kind, cp, cwd, shell: sh, cols, rows, createdAt: Date.now(), buffer: '', listeners: new Set(), exited: null };
    const push = chunk => {
      const text = chunk.toString('utf8');
      s.buffer = (s.buffer + text).slice(-BUFFER_LIMIT);
      s.listeners.forEach(fn => fn({ type: 'data', data: text }));
    };
    cp.stdout.on('data', push);
    cp.stderr.on('data', push);
    cp.on('error', e => { s.exited = { code: -1, error: e.message }; s.listeners.forEach(fn => fn({ type: 'exit', ...s.exited })); });
    cp.on('exit', (code, signal) => { s.exited = { code, signal }; s.listeners.forEach(fn => fn({ type: 'exit', code, signal })); });
    this.sessions.set(id, s);
    audit.log('terminal.create', { id, kind, cwd });
    return this.info(s);
  }

  info(s) { return { id: s.id, kind: s.kind, shell: s.shell, cols: s.cols, rows: s.rows, alive: !s.exited, createdAt: s.createdAt }; }
  list() { return [...this.sessions.values()].map(s => this.info(s)); }
  get(id) { const s = this.sessions.get(id); if (!s) throw new HttpError(404, 'terminal session not found', 'not_found'); return s; }

  input(id, data) {
    const s = this.get(id);
    if (s.exited) throw new HttpError(409, 'terminal session has exited', 'exited');
    if (typeof data !== 'string' || data.length > 65536) throw new HttpError(400, 'invalid input', 'bad_input');
    s.cp.stdin.write(data);
  }

  resize(id, cols, rows) {
    const s = this.get(id);
    cols = Math.max(10, Math.min(500, cols | 0)); rows = Math.max(2, Math.min(200, rows | 0));
    s.cols = cols; s.rows = rows;
    if (s.kind === 'pty' && !s.exited) s.cp.stdio[3].write(`R ${cols} ${rows}\n`);
    return this.info(s);
  }

  /** Subscribe; replays buffered output first. Returns unsubscribe. */
  subscribe(id, fn) {
    const s = this.get(id);
    if (s.buffer) fn({ type: 'data', data: s.buffer });
    if (s.exited) fn({ type: 'exit', ...s.exited });
    s.listeners.add(fn);
    return () => s.listeners.delete(fn);
  }

  kill(id) {
    const s = this.get(id);
    if (!s.exited) { s.cp.kill('SIGTERM'); setTimeout(() => { if (!s.exited) s.cp.kill('SIGKILL'); }, 2000).unref(); }
    this.sessions.delete(id);
    audit.log('terminal.kill', { id });
    return { ok: true };
  }

  restart(id) {
    const s = this.get(id);
    const { cwd, cols, rows, shell } = s;
    this.kill(id);
    return this.create({ cwd, cols, rows, shell });
  }

  killAll() { for (const id of [...this.sessions.keys()]) { try { this.kill(id); } catch { /* ignore */ } } }
}

module.exports = { TerminalManager };
