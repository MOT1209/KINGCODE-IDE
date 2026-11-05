'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kcb-'));
process.env.KINGCODE_HOME = path.join(tmp, 'home');
process.env.KINGCODE_CLAUDE_BIN = path.join(__dirname, 'fixtures/fake-claude.js');
process.env.KINGCODE_OPENCODE_BIN = path.join(__dirname, 'fixtures/fake-opencode.js');
const { createBridge } = require('../server');

const TOKEN = 'a'.repeat(40);
let bridge, base;
const work = path.join(tmp, 'work');

test.before(async () => {
  fs.mkdirSync(work, { recursive: true });
  bridge = createBridge({ token: TOKEN, origins: ['http://app.test'] });
  const a = await bridge.listen(0);
  base = 'http://127.0.0.1:' + a.port;
});
test.after(async () => { await bridge.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function api(method, p, body, { token = TOKEN, headers = {} } = {}) {
  const res = await fetch(base + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
async function ndjson(p, body) {
  const res = await fetch(base + p, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = []; for (const l of (await res.text()).split('\n')) if (l.trim()) out.push(JSON.parse(l)); return out;
}

test('security: health is public, everything else needs the token', async () => {
  assert.equal((await api('GET', '/v1/health', null, { token: null })).status, 200);
  assert.equal((await api('GET', '/v1/info', null, { token: null })).status, 401);
  assert.equal((await api('GET', '/v1/info', null, { token: 'wrong' + 'x'.repeat(35) })).status, 401);
  assert.equal((await api('GET', '/v1/mcp')).status, 200);
});

test('security: Origin allowlist and Host check', async () => {
  const bad = await api('GET', '/v1/health', null, { headers: { Origin: 'http://evil.example' } });
  assert.equal(bad.status, 403);
  const ok = await api('GET', '/v1/health', null, { headers: { Origin: 'http://app.test' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://app.test');
  const pre = await fetch(base + '/v1/info', { method: 'OPTIONS', headers: { Origin: 'http://app.test' } });
  assert.equal(pre.status, 204);
  // DNS-rebinding style Host header
  const code = await new Promise(r => { const q = http.request(base + '/v1/health', { headers: { Host: 'evil.example' } }, res => { res.resume(); r(res.statusCode); }); q.end(); });
  assert.equal(code, 403);
});

test('security: malformed JSON and oversized bodies are rejected', async () => {
  const r = await fetch(base + '/v1/mcp/x', { method: 'PUT', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: '{nope' });
  assert.equal(r.status, 400);
});

test('workspace: requires an open workspace', async () => {
  const fresh = createBridge({ token: TOKEN }); const a = await fresh.listen(0);
  const r = await fetch(`http://127.0.0.1:${a.port}/v1/fs/tree`, { headers: { Authorization: 'Bearer ' + TOKEN } });
  assert.equal(r.status, 409); await fresh.close();
});

test('workspace: open, write, read, tree, mkdir, rename, delete, undo', async () => {
  assert.equal((await api('POST', '/v1/workspace/open', { path: work })).status, 200);
  assert.equal((await api('PUT', '/v1/fs/file', { path: 'src/a.txt', content: 'héllo' })).status, 200);
  const rd = await api('GET', '/v1/fs/file?path=src/a.txt');
  assert.equal(rd.data.content, 'héllo');
  assert.equal((await api('POST', '/v1/fs/mkdir', { path: 'empty' })).status, 200);
  const tree = (await api('GET', '/v1/fs/tree')).data;
  assert.deepEqual(tree.children.map(c => c.name), ['empty', 'src']);
  assert.equal((await api('POST', '/v1/fs/rename', { from: 'src/a.txt', to: 'src/b.txt' })).status, 200);
  assert.equal((await api('POST', '/v1/fs/undo')).data.restored, 'src/a.txt');
  assert.equal((await api('POST', '/v1/fs/delete', { path: 'src/a.txt' })).status, 200);
  assert.equal((await api('GET', '/v1/fs/file?path=src/a.txt')).status, 404);
  assert.equal((await api('POST', '/v1/fs/undo')).data.restored, 'src/a.txt');
  assert.equal((await api('GET', '/v1/fs/file?path=src/a.txt')).data.content, 'héllo');
});

test('workspace: traversal, absolute paths and symlink escapes are blocked', async () => {
  for (const p of ['../x', '/etc/passwd', 'a/../../x', 'C:\\x'])
    assert.equal((await api('PUT', '/v1/fs/file', { path: p, content: 'x' })).status, 400, p);
  const outside = path.join(tmp, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'secret'), 's3cret');
  fs.symlinkSync(outside, path.join(work, 'link'));
  assert.equal((await api('GET', '/v1/fs/file?path=link/secret')).status, 403);
  assert.equal((await api('PUT', '/v1/fs/file', { path: 'link/new', content: 'x' })).status, 403);
  assert.equal(fs.existsSync(path.join(outside, 'new')), false);
  assert.equal((await api('POST', '/v1/fs/delete', { path: '' })).status, 400);
});

test('workspace: write conflict detection and binary refusal', async () => {
  const w = (await api('PUT', '/v1/fs/file', { path: 'c.txt', content: '1' })).data;
  fs.writeFileSync(path.join(work, 'c.txt'), '2'); fs.utimesSync(path.join(work, 'c.txt'), new Date(), new Date(Date.now() + 5000));
  assert.equal((await api('PUT', '/v1/fs/file', { path: 'c.txt', content: '3', expectMtimeMs: w.mtimeMs })).status, 409);
  fs.writeFileSync(path.join(work, 'bin.dat'), Buffer.from([1, 0, 2]));
  assert.equal((await api('GET', '/v1/fs/file?path=bin.dat')).status, 415);
});

test('workspace: watch stream reports changes', async () => {
  const res = await fetch(base + '/v1/fs/watch', { headers: { Authorization: 'Bearer ' + TOKEN } });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let seen = '';
  await reader.read(); // ready
  fs.writeFileSync(path.join(work, 'watched.txt'), 'x');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !seen.includes('watched.txt')) { const { value } = await reader.read(); seen += dec.decode(value); }
  await reader.cancel();
  assert.match(seen, /watched\.txt/);
});

test('git: init, status, add, commit, branch, merge, diff, log', async () => {
  const g = (p, b) => api('POST', '/v1/git/' + p, b);
  assert.equal((await api('GET', '/v1/git/status')).data.repo, false);
  assert.equal((await g('init', {})).status, 200);
  fs.writeFileSync(path.join(work, 'f.txt'), 'one\n');
  let st = (await api('GET', '/v1/git/status')).data;
  assert.equal(st.repo, true); assert.ok(st.files.some(f => f.path === 'f.txt' && f.index === '?'));
  await g('add', { paths: ['f.txt'] });
  const c = await g('commit', { message: 'first', name: 'T', email: 't@example.com' });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal((await api('GET', '/v1/git/log')).data.commits[0].subject, 'first');
  assert.equal((await g('branch', { name: 'feature' })).status, 200);
  fs.appendFileSync(path.join(work, 'f.txt'), 'two\n');
  assert.match((await api('GET', '/v1/git/diff?path=f.txt')).data.diff, /\+two/);
  await g('add', {}); await g('commit', { message: 'second', name: 'T', email: 't@example.com' });
  await g('checkout', { branch: 'main' });
  assert.equal((await g('merge', { branch: 'feature' })).status, 200);
  const br = (await api('GET', '/v1/git/branches')).data.branches;
  assert.ok(br.find(b => b.name === 'main' && b.current));
  assert.equal((await g('checkout', { branch: '--evil' })).status, 400);
  assert.equal((await g('checkout', { branch: 'a..b' })).status, 400);
});

test('git: rejects dangerous clone URLs', async () => {
  for (const url of ['ext::sh -c touch /tmp/pwned', '--upload-pack=touch x', 'ftp://x/y', 'https://a b'])
    assert.equal((await api('POST', '/v1/git/clone', { url, dest: 'c' })).status, 400, url);
});

test('git: clone a local repo into the workspace', async () => {
  const r = await api('POST', '/v1/git/clone', { url: 'file://' + work, dest: 'cloned' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(fs.existsSync(path.join(work, 'cloned', 'f.txt')));
});

test('github: reports missing token without leaking anything', async () => {
  delete process.env.KINGCODE_GITHUB_TOKEN; delete process.env.GITHUB_TOKEN;
  const r = await api('GET', '/v1/github/o/r/pulls');
  assert.equal(r.status, 401); assert.equal(r.data.error.code, 'no_token');
  assert.equal((await api('GET', '/v1/github/o%2F../r/pulls')).status, 400);
});

test('github: lists PRs/issues and creates PR against a mock API (token stays server-side)', async () => {
  const seen = [];
  const mock = http.createServer((req, res) => {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      seen.push({ url: req.url, auth: req.headers.authorization, body: b });
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST') return res.end(JSON.stringify({ number: 7, title: 'T', state: 'open', html_url: 'u', user: { login: 'me' } }));
      res.end(JSON.stringify(req.url.includes('issues') ? [{ number: 1, title: 'i', state: 'open', html_url: 'u' }, { number: 2, title: 'pr', pull_request: {} }] : [{ number: 3, title: 'p', state: 'open', html_url: 'u' }]));
    });
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  process.env.KINGCODE_GITHUB_API = 'http://127.0.0.1:' + mock.address().port; process.env.KINGCODE_GITHUB_TOKEN = 'ghp_secret';
  try {
    assert.equal((await api('GET', '/v1/github/o/r/pulls')).data.pulls[0].number, 3);
    assert.equal((await api('GET', '/v1/github/o/r/issues')).data.issues.length, 1);
    const pr = await api('POST', '/v1/github/o/r/pulls', { title: 'T', head: 'h', base: 'main' });
    assert.equal(pr.data.number, 7);
    assert.equal(seen[0].auth, 'Bearer ghp_secret');
    const info = JSON.stringify((await api('GET', '/v1/info')).data);
    assert.ok(!info.includes('ghp_secret'));
  } finally { mock.close(); delete process.env.KINGCODE_GITHUB_API; delete process.env.KINGCODE_GITHUB_TOKEN; }
});

test('terminal: a real shell session (PTY when available), input, output, resize, kill', async () => {
  const caps = (await api('GET', '/v1/term')).data.capabilities;
  const s = (await api('POST', '/v1/term', { cols: 100, rows: 30 })).data;
  assert.equal(s.kind, caps.pty ? 'pty' : 'pipe');
  const res = await fetch(base + `/v1/term/${s.id}/stream`, { headers: { Authorization: 'Bearer ' + TOKEN } });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let out = '';
  const pump = (async () => { for (;;) { const { value, done } = await reader.read(); if (done) break; out += dec.decode(value); } })();
  await api('POST', `/v1/term/${s.id}/input`, { data: 'echo kc-$((20+22)); pwd\n' });
  if (caps.pty) { await api('POST', `/v1/term/${s.id}/resize`, { cols: 120, rows: 40 }); await api('POST', `/v1/term/${s.id}/input`, { data: 'stty size\n' }); }
  const deadline = Date.now() + 8000;
  const want = () => out.includes('kc-42') && out.includes(fs.realpathSync(work)) && (!caps.pty || out.includes('40 120'));
  while (Date.now() < deadline && !want()) await new Promise(r => setTimeout(r, 50));
  assert.ok(out.includes('kc-42'), 'command output: ' + out);
  assert.ok(out.includes(fs.realpathSync(work)), 'cwd is the workspace');
  if (caps.pty) assert.ok(out.includes('40 120'), 'PTY resize honoured: ' + out);
  await api('POST', `/v1/term/${s.id}/input`, { data: 'exit 3\n' });
  await pump;
  assert.match(out, /"?exit"?|kc-42/);
  assert.equal((await api('DELETE', `/v1/term/${s.id}`)).status, 200);
  assert.equal((await api('POST', `/v1/term/${s.id}/input`, { data: 'x' })).status, 404);
});

test('terminal: restart gives a fresh live session', async () => {
  const s = (await api('POST', '/v1/term', {})).data;
  const n = (await api('POST', `/v1/term/${s.id}/restart`)).data;
  assert.notEqual(n.id, s.id); assert.equal(n.alive, true);
  await api('DELETE', `/v1/term/${n.id}`);
});

test('agents: detection reports both providers', async () => {
  const p = (await api('GET', '/v1/agents')).data.providers;
  assert.deepEqual(p.map(x => x.id), ['opencode', 'claude']);
  assert.ok(p.every(x => x.installed)); assert.equal(p[0].primary, true);
});

test('agents: claude run streams events, maps the read profile to flags, records usage + history', async () => {
  const out = path.join(tmp, 'argv.json'); process.env.FAKE_ARGV_OUT = out;
  const ev = await ndjson('/v1/agents/run', { provider: 'claude', prompt: 'explain', profile: 'read', model: 'sonnet' });
  assert.equal(ev[0].type, 'start');
  assert.ok(ev.some(e => e.type === 'event' && e.event.type === 'assistant'));
  const exit = ev.find(e => e.type === 'exit');
  assert.equal(exit.status, 'completed'); assert.equal(exit.costUsd, 0.0123); assert.equal(exit.usage.output_tokens, 5);
  const argv = JSON.parse(fs.readFileSync(out)).argv;
  assert.ok(argv.includes('--disallowedTools') && argv[argv.indexOf('--disallowedTools') + 1].includes('Bash'));
  assert.equal(argv[argv.indexOf('--allowedTools') + 1], 'Read,Glob,Grep');
  assert.ok(!argv.includes('--dangerously-skip-permissions'));
  assert.equal((await api('GET', '/v1/agents/history')).data.tasks[0].status, 'completed');
});

test('agents: the full profile needs explicit approval; invalid input is rejected', async () => {
  const noAppr = await ndjson('/v1/agents/run', { provider: 'claude', prompt: 'x', profile: 'full' });
  assert.equal(noAppr[0].code, 'approval_required');
  const ok = await ndjson('/v1/agents/run', { provider: 'claude', prompt: 'x', profile: 'full', approved: true });
  assert.equal(ok.find(e => e.type === 'exit').status, 'completed');
  assert.equal((await ndjson('/v1/agents/run', { provider: 'nope', prompt: 'x' }))[0].status, 400);
  assert.equal((await ndjson('/v1/agents/run', { provider: 'claude', prompt: '' }))[0].status, 400);
  assert.equal((await ndjson('/v1/agents/run', { provider: 'claude', prompt: 'x', model: 'a b;rm' }))[0].status, 400);
});

test('agents: opencode run (primary) captures stdout/stderr and passes the permission profile', async () => {
  const out = path.join(tmp, 'argv2.json'); process.env.FAKE_ARGV_OUT = out;
  const ev = await ndjson('/v1/agents/run', { provider: 'opencode', prompt: 'hi there', profile: 'edit', model: 'anthropic/claude-sonnet' });
  assert.ok(ev.some(e => e.type === 'stdout' && e.text === 'opencode says hi'));
  assert.ok(ev.some(e => e.type === 'stderr'));
  assert.equal(ev.find(e => e.type === 'exit').status, 'completed');
  const rec = JSON.parse(fs.readFileSync(out));
  assert.deepEqual(rec.argv, ['run', '--model', 'anthropic/claude-sonnet', 'hi there']);
  assert.deepEqual(JSON.parse(rec.perm), { edit: 'allow', bash: 'deny', webfetch: 'deny' });
});

test('agents: cancellation stops a running task', async () => {
  const res = await fetch(base + '/v1/agents/run', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'claude', prompt: 'hang' }) });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  let id; while (!id) { const { value } = await reader.read(); buf += dec.decode(value); const m = /"id":"(\w+)"/.exec(buf); if (m) id = m[1]; }
  assert.equal((await api('POST', `/v1/agents/${id}/cancel`)).status, 200);
  while (!buf.includes('"type":"exit"')) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value); }
  assert.match(buf, /"status":"cancelled"/);
  assert.equal((await api('POST', `/v1/agents/${id}/cancel`)).status, 404);
});

test('agents: missing CLI is reported honestly, never faked', async () => {
  process.env.KINGCODE_CLAUDE_BIN = '/nonexistent/claude';
  const ev = await ndjson('/v1/agents/run', { provider: 'claude', prompt: 'x' });
  assert.equal(ev[0].code, 'not_installed');
  const p = (await api('GET', '/v1/agents')).data.providers.find(x => x.id === 'claude');
  assert.equal(p.installed, false);
  process.env.KINGCODE_CLAUDE_BIN = path.join(__dirname, 'fixtures/fake-claude.js');
});

test('mcp: add, mask secrets, test (real stdio handshake), toggle, logs, remove', async () => {
  const cfg = { command: process.execPath, args: [path.join(__dirname, 'fixtures/fake-mcp.js')], env: { API_KEY: 'sekret' }, allowedTools: ['echo'] };
  const put = await api('PUT', '/v1/mcp/fake', cfg);
  assert.equal(put.status, 200); assert.equal(put.data.env.API_KEY, '••••');
  assert.ok(!JSON.stringify((await api('GET', '/v1/mcp')).data).includes('sekret'));
  const t = (await api('POST', '/v1/mcp/fake/test')).data;
  assert.equal(t.ok, true); assert.equal(t.serverInfo.name, 'fake-mcp');
  assert.deepEqual(t.tools.map(x => [x.name, x.allowed]), [['echo', true], ['sum', false]]);
  assert.ok((await api('GET', '/v1/mcp/fake/logs')).data.logs.some(l => /listing tools/.test(l.msg)));
  // resending the masked config keeps the stored secret
  await api('PUT', '/v1/mcp/fake', { ...cfg, env: { API_KEY: '••••' } });
  assert.equal(require('../lib/mcp').raw().fake.env.API_KEY, 'sekret');
  assert.equal((await api('POST', '/v1/mcp/fake/enabled', { enabled: false })).data.enabled, false);
  assert.deepEqual(Object.keys(require('../lib/mcp').toClaudeConfig().mcpServers), []);
  assert.equal((await api('DELETE', '/v1/mcp/fake')).status, 200);
  assert.equal((await api('POST', '/v1/mcp/fake/test')).status, 404);
});

test('mcp: failing servers report errors; validation rejects bad configs; HTTP transport works', async () => {
  assert.equal((await api('PUT', '/v1/mcp/bad', { command: '' })).status, 400);
  assert.equal((await api('PUT', '/v1/mcp/Bad Id', { command: 'x' })).status, 400);
  assert.equal((await api('PUT', '/v1/mcp/ftp', { url: 'ftp://x' })).status, 400);
  await api('PUT', '/v1/mcp/nocmd', { command: '/nonexistent/cmd' });
  const t = (await api('POST', '/v1/mcp/nocmd/test')).data;
  assert.equal(t.ok, false); assert.match(t.error, /cannot start|exited/);
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => {
    const m = JSON.parse(b); res.setHeader('Mcp-Session-Id', 's1');
    if (!m.id) { res.statusCode = 202; return res.end(); }
    res.setHeader('Content-Type', 'text/event-stream');
    const result = m.method === 'initialize' ? { protocolVersion: '2025-03-26', serverInfo: { name: 'http-mcp' } } : { tools: [{ name: 'ping' }] };
    res.end('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\n\n');
  }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  await api('PUT', '/v1/mcp/web', { url: 'http://127.0.0.1:' + srv.address().port + '/mcp' });
  const w = (await api('POST', '/v1/mcp/web/test')).data;
  srv.close(); assert.equal(w.ok, true); assert.equal(w.tools[0].name, 'ping');
  for (const id of ['nocmd', 'web']) await api('DELETE', '/v1/mcp/' + id);
});

test('skills: create, validate, edit, toggle, export/import, delete, execution log', async () => {
  const good = '---\nname: reviewer\ndescription: Reviews code\n---\nAlways check edge cases.\n';
  assert.equal((await api('PUT', '/v1/skills/reviewer', { content: good })).status, 200);
  assert.equal((await api('PUT', '/v1/skills/reviewer', { content: good.replace('name: reviewer', 'name: other') })).status, 422);
  assert.equal((await api('PUT', '/v1/skills/BAD', { content: good })).status, 400);
  assert.deepEqual((await api('POST', '/v1/skills/validate', { name: 'x', content: 'no frontmatter' })).data.problems.length > 0, true);
  const list = (await api('GET', '/v1/skills')).data.skills;
  assert.equal(list[0].name, 'reviewer'); assert.equal(list[0].enabled, true);
  await api('PUT', '/v1/skills/reviewer', { content: good.replace('edge cases', 'edge cases and errors') });
  assert.match((await api('GET', '/v1/skills/reviewer')).data.content, /and errors/);
  // a run injects the skill and logs it
  const argvFile = path.join(tmp, 'argv3.json'); process.env.FAKE_ARGV_OUT = argvFile;
  await ndjson('/v1/agents/run', { provider: 'claude', prompt: 'do it', skills: ['reviewer'] });
  const p = JSON.parse(fs.readFileSync(argvFile)).argv; assert.match(p[p.indexOf('-p') + 1], /Skill: reviewer[\s\S]*and errors[\s\S]*do it$/);
  assert.equal((await api('GET', '/v1/skills')).data.logs.at(-1).skill, 'reviewer');
  // disabled skills are refused
  await api('POST', '/v1/skills/reviewer/enabled', { enabled: false });
  assert.equal((await ndjson('/v1/agents/run', { provider: 'claude', prompt: 'x', skills: ['reviewer'] }))[0].code, 'disabled');
  const bundle = (await api('GET', '/v1/skills/export')).data;
  assert.equal(bundle.format, 'kingcode-skills/1');
  await api('DELETE', '/v1/skills/reviewer');
  assert.equal((await api('GET', '/v1/skills/reviewer')).status, 404);
  const imp = (await api('POST', '/v1/skills/import', { bundle })).data;
  assert.deepEqual(imp.imported, ['reviewer']);
  assert.deepEqual((await api('POST', '/v1/skills/import', { bundle })).data.skipped, ['reviewer']);
  assert.equal((await api('POST', '/v1/skills/import', { bundle: { format: 'x' } })).status, 400);
});

test('extensions: install, permissions, compatibility, enable, update, remove', async () => {
  const mk = (v, extra = {}) => ({ manifest: { id: 'hello', name: 'Hello', version: v, main: 'main.js', permissions: ['ui.notify'], ...extra }, files: { 'main.js': 'kc.notify("hi")' } });
  const inst = await api('POST', '/v1/extensions/install', { bundle: mk('1.0.0') });
  assert.equal(inst.status, 200); assert.equal(inst.data.enabled, false); assert.deepEqual(inst.data.granted, []);
  assert.equal((await api('POST', '/v1/extensions/install', { bundle: mk('1.0.0') })).status, 409);
  assert.equal((await api('POST', '/v1/extensions/hello/granted', { granted: ['network'] })).status, 400);
  assert.deepEqual((await api('POST', '/v1/extensions/hello/granted', { granted: ['ui.notify'] })).data.granted, ['ui.notify']);
  assert.equal((await api('POST', '/v1/extensions/hello/enabled', { enabled: true })).data.enabled, true);
  assert.equal((await api('GET', '/v1/extensions/hello/source')).data.code, 'kc.notify("hi")');
  assert.equal((await api('POST', '/v1/extensions/install', { bundle: mk('1.0.0'), update: true })).status, 409);
  assert.equal((await api('POST', '/v1/extensions/install', { bundle: mk('1.1.0'), update: true })).data.version, '1.1.0');
  // bad manifests
  for (const bad of [{ id: '../x' }, { permissions: ['root'] }, { main: '../evil.js' }, { version: '1' }, { engines: { kingcode: '>=99.0.0' } }])
    assert.ok([422].includes((await api('POST', '/v1/extensions/install', { bundle: { ...mk('1.0.0', { id: 'other', ...bad }) } })).status), JSON.stringify(bad));
  assert.equal((await api('POST', '/v1/extensions/install', { bundle: { manifest: mk('1.0.0', { id: 'pathy' }).manifest, files: { 'main.js': 'x', '../e.js': 'y' } } })).status, 422);
  assert.equal((await api('DELETE', '/v1/extensions/hello')).status, 200);
  assert.equal((await api('GET', '/v1/extensions')).data.extensions.length, 0);
});

test('project builder: lists templates and scaffolds without overwriting', async () => {
  const list = (await api('GET', '/v1/templates')).data.templates.map(t => t.id);
  for (const id of ['html', 'node', 'python', 'java', 'c', 'cpp', 'react', 'vue', 'nextjs', 'flutter', 'react-native']) assert.ok(list.includes(id), id);
  const r = await api('POST', '/v1/templates/apply', { id: 'node', dir: 'apps/demo', name: 'demo' });
  assert.equal(r.status, 200); assert.ok(r.data.created.includes('apps/demo/package.json'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(work, 'apps/demo/package.json'))).name, 'demo');
  assert.equal((await api('POST', '/v1/templates/apply', { id: 'node', dir: 'apps/demo', name: 'demo' })).status, 409);
  assert.equal((await api('POST', '/v1/templates/apply', { id: 'node', dir: '../escape', name: 'x' })).status, 400);
  assert.equal((await api('POST', '/v1/templates/apply', { id: 'nope', dir: 'z' })).status, 404);
  // The generated Node template really runs
  const { execFileSync } = require('child_process');
  assert.match(execFileSync(process.execPath, ['index.js'], { cwd: path.join(work, 'apps/demo') }).toString(), /Hello from demo/);
});

test('audit log records privileged actions without secrets', async () => {
  const entries = (await api('GET', '/v1/audit?n=1000')).data.entries.map(e => e.action);
  for (const a of ['workspace.open', 'fs.delete', 'git.commit', 'terminal.create', 'agent.run', 'mcp.add', 'skill.save', 'extension.install', 'template.apply']) assert.ok(entries.includes(a), a);
  assert.ok(!JSON.stringify(entries).includes('sekret'));
});
