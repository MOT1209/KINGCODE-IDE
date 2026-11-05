'use strict';
/* King Git — wraps the system git CLI via execFile (no shell). Inputs are validated; credentials are
   never stored by the bridge (git uses the user's own credential helper / SSH agent). */
const { execFile } = require('child_process');
const { HttpError } = require('./util');
const audit = require('./audit');

const BRANCH_RE = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,200}$/;
const REMOTE_RE = /^[A-Za-z0-9._-]{1,64}$/;
const REV_RE = /^[A-Za-z0-9._/~^@{}-]{1,200}$/;

function run(cwd, args, { timeout = 60000, input, maxBuffer = 16 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo', LC_ALL: 'C' };
    delete env.KINGCODE_TOKEN;
    const cp = execFile('git', ['-c', 'protocol.ext.allow=never', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, env, timeout, maxBuffer }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') return reject(new HttpError(501, 'git is not installed', 'no_git'));
        return reject(new HttpError(422, (stderr || err.message).toString().trim().slice(0, 2000), 'git_failed'));
      }
      resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
    if (input !== undefined) cp.stdin.end(input);
  });
}

const branch = b => { if (typeof b !== 'string' || !BRANCH_RE.test(b)) throw new HttpError(400, 'invalid branch name', 'bad_input'); return b; };
const remote = r => { if (typeof r !== 'string' || !REMOTE_RE.test(r)) throw new HttpError(400, 'invalid remote name', 'bad_input'); return r; };
const rev = r => { if (typeof r !== 'string' || !REV_RE.test(r) || r.startsWith('-')) throw new HttpError(400, 'invalid revision', 'bad_input'); return r; };

function parseStatus(out) {
  const files = []; let branchInfo = {};
  for (const line of out.split('\n')) {
    if (!line) continue;
    if (line.startsWith('## ')) {
      const m = /^## (?:No commits yet on |Initial commit on )?([^\s.]+(?:\/[^\s.]+)*)?(?:\.\.\.(\S+))?(?: \[(.*)\])?/.exec(line);
      branchInfo = { branch: m && m[1], upstream: m && m[2], tracking: m && m[3] };
      continue;
    }
    files.push({ index: line[0], worktree: line[1], path: line.slice(3) });
  }
  return { ...branchInfo, files, clean: files.length === 0 };
}

function createGit(getRoot) {
  const cwd = () => getRoot();
  return {
    version: async () => (await run(process.cwd(), ['--version'])).stdout.trim(),
    async isRepo() { try { await run(cwd(), ['rev-parse', '--is-inside-work-tree']); return true; } catch { return false; } },
    async init(initialBranch = 'main') { branch(initialBranch); await run(cwd(), ['init', '-b', initialBranch]); audit.log('git.init'); return { ok: true }; },
    async status() { return parseStatus((await run(cwd(), ['status', '--porcelain=v1', '-b'])).stdout); },
    async add(paths) { await run(cwd(), ['add', '--', ...(paths && paths.length ? paths.map(p => String(p)) : ['.'])]); return { ok: true }; },
    async unstage(paths) { await run(cwd(), ['reset', '-q', '--', ...(paths && paths.length ? paths.map(String) : ['.'])]); return { ok: true }; },
    async commit(message, { name, email } = {}) {
      if (typeof message !== 'string' || !message.trim() || message.length > 10000) throw new HttpError(400, 'commit message required', 'bad_input');
      const pre = [];
      if (name && email) pre.push('-c', 'user.name=' + String(name), '-c', 'user.email=' + String(email));
      const r = await run(cwd(), [...pre, 'commit', '-m', message]);
      audit.log('git.commit', { message: message.slice(0, 120) });
      return { output: r.stdout.trim() };
    },
    async log(n = 30) {
      const limit = Math.max(1, Math.min(200, parseInt(n, 10) || 30));
      let out;
      try { out = (await run(cwd(), ['log', `-n${limit}`, '--pretty=format:%H%x1f%an%x1f%aI%x1f%s'])).stdout; } catch (e) { if (/does not have any commits/.test(e.message)) return []; throw e; }
      return out.split('\n').filter(Boolean).map(l => { const [hash, author, date, subject] = l.split('\x1f'); return { hash, author, date, subject }; });
    },
    async diff({ path, staged } = {}) {
      const args = ['diff', '--no-color']; if (staged) args.push('--cached');
      if (path) args.push('--', String(path));
      return { diff: (await run(cwd(), args)).stdout };
    },
    async show(r) { return { diff: (await run(cwd(), ['show', '--no-color', '--stat', '--patch', rev(r)])).stdout }; },
    async branches() {
      const out = (await run(cwd(), ['branch', '--format=%(HEAD)%09%(refname:short)'])).stdout;
      return out.split('\n').filter(Boolean).map(l => ({ current: l[0] === '*', name: l.slice(2) }));
    },
    async createBranch(name, checkout = true) { branch(name); await run(cwd(), checkout ? ['checkout', '-b', name] : ['branch', name]); return { ok: true }; },
    async checkout(name) { branch(name); await run(cwd(), ['checkout', name]); return { ok: true }; },
    async deleteBranch(name) { branch(name); await run(cwd(), ['branch', '-d', name]); audit.log('git.branch.delete', { name }); return { ok: true }; },
    async merge(name) { branch(name); const r = await run(cwd(), ['merge', '--no-edit', name]); audit.log('git.merge', { name }); return { output: r.stdout.trim() }; },
    async mergeAbort() { await run(cwd(), ['merge', '--abort']); return { ok: true }; },
    async rebase(onto) { branch(onto); const r = await run(cwd(), ['rebase', onto]); audit.log('git.rebase', { onto }); return { output: r.stdout.trim() }; },
    async rebaseAbort() { await run(cwd(), ['rebase', '--abort']); return { ok: true }; },
    async remotes() { return (await run(cwd(), ['remote', '-v'])).stdout.split('\n').filter(Boolean); },
    async fetch(r = 'origin') { await run(cwd(), ['fetch', remote(r)], { timeout: 120000 }); return { ok: true }; },
    async pull(r = 'origin', b) { const args = ['pull', '--ff-only', remote(r)]; if (b) args.push(branch(b)); const res = await run(cwd(), args, { timeout: 120000 }); audit.log('git.pull', { remote: r }); return { output: res.stdout.trim() }; },
    async push(r = 'origin', b, { setUpstream } = {}) {
      const args = ['push']; if (setUpstream) args.push('-u'); args.push(remote(r)); if (b) args.push(branch(b));
      const res = await run(cwd(), args, { timeout: 120000 }); audit.log('git.push', { remote: r, branch: b }); return { output: (res.stdout + res.stderr).trim() };
    },
    async addRemote(name, url) { remote(name); assertGitUrl(url); await run(cwd(), ['remote', 'add', name, url]); return { ok: true }; },
    async clone(url, dest) {
      assertGitUrl(url);
      await run(cwd(), ['clone', '--', url, dest], { timeout: 600000 });
      audit.log('git.clone', { url: redact(url), dest });
      return { ok: true };
    }
  };
}

function assertGitUrl(url) {
  if (typeof url !== 'string' || url.length > 2000 || url.startsWith('-') || /[\s\0]/.test(url)) throw new HttpError(400, 'invalid repository URL', 'bad_input');
  if (!/^(https:\/\/|ssh:\/\/|git@[\w.-]+:|git:\/\/|file:\/\/\/|\.{0,2}\/)/.test(url)) throw new HttpError(400, 'unsupported repository URL scheme', 'bad_input');
}
function redact(url) { return String(url).replace(/\/\/[^@/]+@/, '//***@'); }

module.exports = { createGit, parseStatus, assertGitUrl };
