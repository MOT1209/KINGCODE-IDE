'use strict';
/* King Agent System — runs real agent CLIs (OpenCode = primary, Claude Code = secondary) inside the workspace.
   Nothing is simulated: if a CLI is not installed, detect() says so and run() refuses.
   Permission profiles map to each CLI's own permission flags; "full" (shell/network capable) requires
   an explicit approval flag from the user. Every run is audit-logged and kept in a task history. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { HttpError, home, readJson, writeJson } = require('./util');
const audit = require('./audit');
const skills = require('./skills');
const mcp = require('./mcp');

const PROFILES = ['read', 'edit', 'full'];
const bin = name => process.env['KINGCODE_' + name.toUpperCase() + '_BIN'] || (name === 'claude' ? 'claude' : 'opencode');
const MAX_CONCURRENT = 3, DEFAULT_TIMEOUT = 15 * 60 * 1000;

const PROVIDERS = {
  opencode: {
    label: 'OpenCode', primary: true,
    build(o) {
      const args = ['run'];
      if (o.model) args.push('--model', o.model);
      args.push(o.prompt);
      // OpenCode reads permissions from OPENCODE_PERMISSION (JSON). Unverified against a live OpenCode install.
      const perm = o.profile === 'read' ? { edit: 'deny', bash: 'deny', webfetch: 'deny' } : o.profile === 'edit' ? { edit: 'allow', bash: 'deny', webfetch: 'deny' } : { edit: 'allow', bash: 'allow', webfetch: 'allow' };
      return { args, env: { OPENCODE_PERMISSION: JSON.stringify(perm) }, parse: 'text' };
    }
  },
  claude: {
    label: 'Claude Code', primary: false,
    build(o) {
      const args = ['-p', o.prompt, '--output-format', 'stream-json', '--verbose'];
      if (o.model) args.push('--model', o.model);
      const tools = o.profile === 'read' ? ['Read', 'Glob', 'Grep'] : o.profile === 'edit' ? ['Read', 'Glob', 'Grep', 'Edit', 'Write'] : ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash', 'WebFetch'];
      args.push('--allowedTools', tools.join(','));
      if (o.profile !== 'full') args.push('--disallowedTools', o.profile === 'read' ? 'Bash,Edit,Write,WebFetch' : 'Bash,WebFetch');
      if (o.mcpConfigPath) args.push('--mcp-config', o.mcpConfigPath);
      return { args, env: {}, parse: 'json-lines' };
    }
  }
};

function probe(name) {
  return new Promise(resolve => {
    execFile(bin(name), ['--version'], { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve({ installed: false, error: err.code === 'ENOENT' ? 'not installed (command not found)' : err.message.split('\n')[0] });
      resolve({ installed: true, version: String(stdout).trim().split('\n')[0] });
    });
  });
}

class AgentManager {
  constructor() { this.runs = new Map(); }
  async detect() {
    const out = [];
    for (const [id, p] of Object.entries(PROVIDERS)) out.push({ id, label: p.label, primary: p.primary, ...(await probe(id)) });
    return out;
  }
  historyFile() { return path.join(home(), 'agent-history.json'); }
  history() { return readJson(this.historyFile(), []).slice(-100).reverse(); }
  _record(rec) { const h = readJson(this.historyFile(), []); const i = h.findIndex(r => r.id === rec.id); if (i >= 0) h[i] = rec; else h.push(rec); writeJson(this.historyFile(), h.slice(-300)); }
  active() { return [...this.runs.values()].map(r => ({ id: r.rec.id, provider: r.rec.provider, status: r.rec.status, startedAt: r.rec.startedAt })); }

  /** Starts a run; `emit(event)` receives streaming events. Returns { id, done: Promise }. */
  async start(opts, cwd, emit) {
    const provider = PROVIDERS[opts.provider];
    if (!provider) throw new HttpError(400, 'unknown provider', 'bad_input');
    if (typeof opts.prompt !== 'string' || !opts.prompt.trim() || opts.prompt.length > 50000) throw new HttpError(400, '"prompt" is required (max 50000 chars)', 'bad_input');
    const profile = opts.profile || 'read';
    if (!PROFILES.includes(profile)) throw new HttpError(400, 'profile must be read | edit | full', 'bad_input');
    if (profile === 'full' && opts.approved !== true) throw new HttpError(403, 'the "full" profile (shell/network access) requires explicit user approval', 'approval_required');
    if (opts.model !== undefined && !/^[\w./:@-]{1,100}$/.test(opts.model)) throw new HttpError(400, 'invalid model id', 'bad_input');
    if (this.runs.size >= MAX_CONCURRENT) throw new HttpError(429, 'too many concurrent agent runs', 'limit');
    const det = await probe(opts.provider);
    if (!det.installed) throw new HttpError(501, `${provider.label} is not available: ${det.error}`, 'not_installed');

    const prefix = skills.inject(opts.skills || [], { provider: opts.provider });
    const full = prefix + opts.prompt;
    let mcpConfigPath;
    if (opts.provider === 'claude' && opts.useMcp) {
      const cfg = mcp.toClaudeConfig();
      if (Object.keys(cfg.mcpServers).length) { mcpConfigPath = path.join(home(), 'run-mcp-' + crypto.randomBytes(4).toString('hex') + '.json'); writeJson(mcpConfigPath, cfg); }
    }
    const built = provider.build({ prompt: full, model: opts.model, profile, mcpConfigPath });
    const id = crypto.randomBytes(6).toString('hex');
    const rec = { id, provider: opts.provider, profile, model: opts.model || null, prompt: opts.prompt.slice(0, 500), skills: opts.skills || [], status: 'running', startedAt: new Date().toISOString(), usage: null, costUsd: null, exitCode: null, summary: '' };
    this._record(rec);
    audit.log('agent.run', { id, provider: opts.provider, profile, cwd, skills: rec.skills });

    const env = { ...process.env, ...built.env }; delete env.KINGCODE_TOKEN; delete env.KINGCODE_GITHUB_TOKEN;
    const cp = spawn(bin(opts.provider), built.args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const run = { rec, cp, cancelled: false };
    this.runs.set(id, run);
    emit({ type: 'start', id, provider: opts.provider, profile });
    let out = '', err = '';
    const feed = (stream, tag) => {
      let buf = '';
      stream.on('data', d => {
        buf += d.toString('utf8');
        let i; while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          if (tag === 'stderr') { err = (err + line + '\n').slice(-4000); emit({ type: 'stderr', text: line }); continue; }
          if (built.parse === 'json-lines') {
            try {
              const ev = JSON.parse(line); emit({ type: 'event', event: ev });
              if (ev.type === 'result') { rec.costUsd = ev.total_cost_usd ?? null; rec.usage = ev.usage || null; rec.summary = String(ev.result || '').slice(0, 2000); }
              continue;
            } catch { /* fall through as text */ }
          }
          out = (out + line + '\n').slice(-4000); emit({ type: 'stdout', text: line });
        }
      });
    };
    feed(cp.stdout, 'stdout'); feed(cp.stderr, 'stderr');
    const timer = setTimeout(() => { run.timedOut = true; this._kill(run); }, opts.timeoutMs || DEFAULT_TIMEOUT);

    const done = new Promise(resolve => {
      const finish = (code, signal, spawnErr) => {
        clearTimeout(timer); this.runs.delete(id);
        if (mcpConfigPath) fs.rmSync(mcpConfigPath, { force: true });
        rec.exitCode = code; rec.finishedAt = new Date().toISOString();
        rec.status = spawnErr ? 'error' : run.cancelled ? 'cancelled' : run.timedOut ? 'timeout' : code === 0 ? 'completed' : 'failed';
        if (!rec.summary) rec.summary = (spawnErr || (code === 0 ? out : err || out)).toString().trim().slice(-800);
        this._record(rec); audit.log('agent.finish', { id, status: rec.status, costUsd: rec.costUsd });
        emit({ type: 'exit', id, status: rec.status, code, signal, usage: rec.usage, costUsd: rec.costUsd });
        resolve(rec);
      };
      cp.on('error', e => finish(-1, null, e.message));
      cp.on('close', (code, signal) => finish(code, signal));
    });
    return { id, done };
  }
  _kill(run) { try { run.cp.kill('SIGTERM'); } catch { /* gone */ } setTimeout(() => { try { run.cp.kill('SIGKILL'); } catch { /* gone */ } }, 3000).unref(); }
  cancel(id) {
    const run = this.runs.get(id); if (!run) throw new HttpError(404, 'no such running task', 'not_found');
    run.cancelled = true; this._kill(run); audit.log('agent.cancel', { id }); return { ok: true };
  }
  cancelAll() { for (const r of this.runs.values()) { r.cancelled = true; this._kill(r); } }
}

module.exports = { AgentManager, PROFILES, PROVIDERS };
