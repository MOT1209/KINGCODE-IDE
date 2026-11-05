'use strict';
/* King Bridge — local companion server for the kingCode IDE.
   Zero dependencies. Binds to loopback only, requires a bearer token, validates Host and Origin
   (DNS-rebinding / cross-site protection), limits body sizes and audit-logs privileged actions. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HttpError, home, readBody, str, id: vid } = require('./lib/util');
const { Workspace } = require('./lib/workspace');
const { createGit } = require('./lib/git');
const { TerminalManager } = require('./lib/terminal');
const { AgentManager } = require('./lib/agents');
const github = require('./lib/github');
const mcp = require('./lib/mcp');
const skills = require('./lib/skills');
const extensions = require('./lib/extensions');
const templates = require('./lib/templates');
const audit = require('./lib/audit');

const VERSION = '1.0.0';

function loadToken() {
  if (process.env.KINGCODE_TOKEN) return process.env.KINGCODE_TOKEN;
  const f = path.join(home(), 'token');
  try { const t = fs.readFileSync(f, 'utf8').trim(); if (t.length >= 32) return t; } catch { /* create */ }
  const t = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, t + '\n', { mode: 0o600 });
  return t;
}

function createBridge(opts = {}) {
  const token = opts.token || loadToken();
  const allowedOrigins = new Set((opts.origins || (process.env.KINGCODE_ORIGINS || '').split(',')).map(s => s.trim()).filter(Boolean)
    .concat(['http://127.0.0.1:8123', 'http://localhost:8123']));
  const allowedRoots = (opts.roots || (process.env.KINGCODE_ROOTS || '').split(path.delimiter)).filter(Boolean).map(r => { try { return fs.realpathSync(r); } catch { return path.resolve(r); } });
  const ws = new Workspace();
  const git = createGit(() => ws.need());
  const terms = new TerminalManager();
  const agents = new AgentManager();

  const json = (res, status, body, cors) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors });
    res.end(JSON.stringify(body));
  };
  /** NDJSON streaming helper. Returns { send, end }. */
  const stream = (req, res, cors) => {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors });
    return { send: o => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); }, end: () => { if (!res.writableEnded) res.end(); }, onClose: fn => res.on('close', fn) };
  };

  const authOk = req => {
    const h = req.headers.authorization || '';
    const given = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
    const want = Buffer.from(token);
    return given.length === want.length && crypto.timingSafeEqual(given, want);
  };

  /* route table: [method, regex, handler(ctx)] — ctx = { req, res, body, query, params, cors } */
  const routes = [];
  const R = (m, p, h, { auth = true } = {}) => routes.push({ m, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), h, auth });

  R('GET', '/v1/health', () => ({ ok: true, name: 'kingcode-bridge', version: VERSION }), { auth: false });
  R('GET', '/v1/info', async () => ({
    version: VERSION, platform: process.platform, node: process.version, workspace: ws.root,
    git: await git.version().catch(() => null), terminal: terms.capabilities(), agents: await agents.detect(),
    github: { configured: github.configured() }, extensionPermissions: extensions.PERMISSIONS
  }));

  /* Workspace */
  R('POST', '/v1/workspace/open', ({ body }) => ws.open(str(body.path, 'path'), { allowedRoots }));
  R('GET', '/v1/fs/tree', ({ query }) => ws.tree(query.path || '', { depth: Math.min(10, +query.depth || 6) }));
  R('GET', '/v1/fs/file', ({ query }) => ws.read(str(query.path, 'path')));
  R('PUT', '/v1/fs/file', ({ body }) => ws.write(str(body.path, 'path'), body.content, { expectMtimeMs: body.expectMtimeMs }));
  R('POST', '/v1/fs/mkdir', ({ body }) => ws.mkdir(str(body.path, 'path')));
  R('POST', '/v1/fs/rename', ({ body }) => ws.rename(str(body.from, 'from'), str(body.to, 'to')));
  R('POST', '/v1/fs/delete', ({ body }) => ws.remove(str(body.path, 'path')));
  R('POST', '/v1/fs/undo', () => ws.undo());
  R('GET', '/v1/fs/watch', ({ req, res, cors }) => {
    ws.need(); const s = stream(req, res, cors); s.send({ type: 'ready' });
    const close = ws.watch(ev => s.send(ev)); const ping = setInterval(() => s.send({ type: 'ping' }), 20000);
    s.onClose(() => { close(); clearInterval(ping); }); return STREAMED;
  });

  /* Git / GitHub */
  const G = (name, fn) => R('POST', '/v1/git/' + name, async ({ body }) => { ws.need(); return fn(body); });
  R('GET', '/v1/git/status', async () => { ws.need(); return (await git.isRepo()) ? { repo: true, ...(await git.status()) } : { repo: false }; });
  G('init', b => git.init(b.branch)); G('add', b => git.add(b.paths)); G('unstage', b => git.unstage(b.paths));
  G('commit', b => git.commit(b.message, b)); G('checkout', b => git.checkout(b.branch)); G('branch', b => git.createBranch(b.name, b.checkout !== false));
  G('branch-delete', b => git.deleteBranch(b.name)); G('merge', b => git.merge(b.branch)); G('merge-abort', () => git.mergeAbort());
  G('rebase', b => git.rebase(b.onto)); G('rebase-abort', () => git.rebaseAbort()); G('fetch', b => git.fetch(b.remote));
  G('pull', b => git.pull(b.remote, b.branch)); G('push', b => git.push(b.remote, b.branch, b)); G('remote-add', b => git.addRemote(b.name, b.url));
  G('clone', async b => { const dest = await ws.resolve(str(b.dest, 'dest')); return git.clone(str(b.url, 'url'), path.relative(ws.root, dest)); });
  R('GET', '/v1/git/log', async ({ query }) => { ws.need(); return { commits: await git.log(query.n) }; });
  R('GET', '/v1/git/diff', async ({ query }) => { ws.need(); return git.diff({ path: query.path, staged: query.staged === '1' }); });
  R('GET', '/v1/git/branches', async () => { ws.need(); return { branches: await git.branches() }; });
  R('GET', '/v1/git/remotes', async () => { ws.need(); return { remotes: await git.remotes() }; });
  R('GET', '/v1/github/:owner/:repo/pulls', async ({ params, query }) => ({ pulls: await github.listPulls(params.owner, params.repo, query.state) }));
  R('GET', '/v1/github/:owner/:repo/issues', async ({ params, query }) => ({ issues: await github.listIssues(params.owner, params.repo, query.state) }));
  R('POST', '/v1/github/:owner/:repo/pulls', async ({ params, body }) => github.createPull(params.owner, params.repo, { title: str(body.title, 'title'), head: str(body.head, 'head'), base: str(body.base, 'base'), body: body.body }));
  R('POST', '/v1/github/:owner/:repo/issues', async ({ params, body }) => github.createIssue(params.owner, params.repo, { title: str(body.title, 'title'), body: body.body }));

  /* Terminal */
  R('GET', '/v1/term', () => ({ sessions: terms.list(), capabilities: terms.capabilities() }));
  R('POST', '/v1/term', async ({ body }) => { const cwd = body.cwd ? await ws.resolve(str(body.cwd, 'cwd'), { mustExist: true }) : ws.need(); return terms.create({ cwd, cols: body.cols, rows: body.rows }); });
  R('GET', '/v1/term/:id/stream', ({ req, res, params, cors }) => {
    terms.get(params.id); const s = stream(req, res, cors);
    const off = terms.subscribe(params.id, ev => { s.send(ev); if (ev.type === 'exit') s.end(); });
    s.onClose(off); return STREAMED;
  });
  R('POST', '/v1/term/:id/input', ({ params, body }) => { terms.input(params.id, body.data); return { ok: true }; });
  R('POST', '/v1/term/:id/resize', ({ params, body }) => terms.resize(params.id, body.cols, body.rows));
  R('POST', '/v1/term/:id/restart', ({ params }) => terms.restart(params.id));
  R('DELETE', '/v1/term/:id', ({ params }) => terms.kill(params.id));

  /* Agents */
  R('GET', '/v1/agents', async () => ({ providers: await agents.detect(), active: agents.active() }));
  R('GET', '/v1/agents/history', () => ({ tasks: agents.history() }));
  R('POST', '/v1/agents/run', async ({ req, res, body, cors }) => {
    const cwd = ws.need();
    const s = stream(req, res, cors);
    try {
      const { id, done } = await agents.start({ provider: body.provider, prompt: body.prompt, model: body.model, profile: body.profile, approved: body.approved, skills: body.skills, useMcp: body.useMcp }, cwd, ev => s.send(ev));
      s.onClose(() => { if (!res.writableFinished) { try { agents.cancel(id); } catch { /* finished */ } } });
      await done; s.end();
    } catch (e) { s.send({ type: 'error', code: e.code || 'error', message: e.message, status: e.status || 500 }); s.end(); }
    return STREAMED;
  });
  R('POST', '/v1/agents/:id/cancel', ({ params }) => agents.cancel(params.id));
  R('GET', '/v1/audit', ({ query }) => ({ entries: audit.tail(Math.min(1000, +query.n || 200)) }));

  /* MCP */
  R('GET', '/v1/mcp', () => ({ servers: mcp.list() }));
  R('PUT', '/v1/mcp/:id', ({ params, body }) => mcp.upsert(params.id, body));
  R('POST', '/v1/mcp/:id/enabled', ({ params, body }) => mcp.setEnabled(params.id, body.enabled));
  R('POST', '/v1/mcp/:id/test', ({ params }) => mcp.test(params.id));
  R('GET', '/v1/mcp/:id/logs', ({ params }) => ({ logs: mcp.logs(params.id) }));
  R('DELETE', '/v1/mcp/:id', ({ params }) => mcp.remove(params.id));

  /* Skills */
  R('GET', '/v1/skills', () => ({ skills: skills.list(), logs: skills.logs() }));
  R('GET', '/v1/skills/export', ({ query }) => skills.exportBundle(query.names ? query.names.split(',') : null));
  R('POST', '/v1/skills/import', ({ body }) => skills.importBundle(body.bundle, { overwrite: body.overwrite === true }));
  R('POST', '/v1/skills/validate', ({ body }) => ({ problems: skills.validate(body.name, body.content) }));
  R('GET', '/v1/skills/:name', ({ params }) => skills.get(params.name));
  R('PUT', '/v1/skills/:name', ({ params, body }) => skills.save(params.name, body.content));
  R('POST', '/v1/skills/:name/enabled', ({ params, body }) => skills.setEnabled(params.name, body.enabled));
  R('DELETE', '/v1/skills/:name', ({ params }) => skills.remove(params.name));

  /* Extensions */
  R('GET', '/v1/extensions', () => ({ extensions: extensions.list(), hostVersion: extensions.HOST_VERSION }));
  R('POST', '/v1/extensions/install', ({ body }) => extensions.install(body.bundle, { update: body.update === true }));
  R('POST', '/v1/extensions/:id/granted', ({ params, body }) => extensions.setGranted(params.id, body.granted));
  R('POST', '/v1/extensions/:id/enabled', ({ params, body }) => extensions.setEnabled(params.id, body.enabled));
  R('GET', '/v1/extensions/:id/source', ({ params }) => extensions.source(params.id));
  R('DELETE', '/v1/extensions/:id', ({ params }) => extensions.remove(params.id));

  /* Project builder */
  R('GET', '/v1/templates', () => ({ templates: templates.list() }));
  R('POST', '/v1/templates/apply', ({ body }) => templates.apply(ws, vid(body.id, 'id'), typeof body.dir === 'string' ? body.dir : '', body.name));

  const STREAMED = Symbol('streamed');

  const server = http.createServer(async (req, res) => {
    let cors = {};
    try {
      const host = (req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
      if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !opts.allowAnyHost) throw new HttpError(403, 'bad Host header', 'forbidden');
      const origin = req.headers.origin;
      if (origin) {
        if (!allowedOrigins.has(origin)) throw new HttpError(403, 'origin not allowed', 'forbidden');
        cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Max-Age': '600' };
      }
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      const url = new URL(req.url, 'http://x');
      const route = routes.map(r => ({ r, m: r.re.exec(url.pathname) })).find(x => x.m && x.r.m === req.method);
      if (!route) throw new HttpError(404, 'not found', 'not_found');
      if (route.r.auth && !authOk(req)) throw new HttpError(401, 'missing or invalid token', 'unauthorized');
      const query = Object.fromEntries(url.searchParams);
      const params = {}; for (const [k, v] of Object.entries(route.m.groups || {})) { try { params[k] = decodeURIComponent(v); } catch { throw new HttpError(400, 'bad URL encoding', 'bad_input'); } }
      const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
      const out = await route.r.h({ req, res, body, query, params, cors });
      if (out === STREAMED) return;
      json(res, 200, out === undefined ? { ok: true } : out, cors);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (!(e instanceof HttpError)) audit.log('bridge.error', { message: String(e && e.message).slice(0, 300) });
      if (res.headersSent) return res.end();
      json(res, status, { error: { code: e.code || 'internal', message: e instanceof HttpError ? e.message : 'internal error' } }, cors);
    }
  });

  return {
    server, token, workspace: ws, terminals: terms, agents,
    listen: (port = 0, host = '127.0.0.1') => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => resolve(server.address())); }),
    close: () => new Promise(resolve => { terms.killAll(); agents.cancelAll(); server.closeAllConnections?.(); server.close(() => resolve()); })
  };
}

module.exports = { createBridge, VERSION };
