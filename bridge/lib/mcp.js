'use strict';
/* King MCP — registry of MCP servers + a real connection tester (JSON-RPC "initialize" + "tools/list"
   over stdio or HTTP). Servers are stored in $KINGCODE_HOME/mcp.json. */
const path = require('path');
const { spawn } = require('child_process');
const { HttpError, home, readJson, writeJson, id: vid } = require('./util');
const audit = require('./audit');

const file = () => path.join(home(), 'mcp.json');
const load = () => readJson(file(), { servers: {} });
const logs = new Map(); // serverId -> [{t, level, msg}]

function addLog(sid, level, msg) {
  const arr = logs.get(sid) || []; arr.push({ t: new Date().toISOString(), level, msg: String(msg).slice(0, 2000) });
  if (arr.length > 300) arr.shift(); logs.set(sid, arr);
}

function validate(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new HttpError(400, 'server config must be an object', 'bad_input');
  const type = cfg.type || (cfg.url ? 'http' : 'stdio');
  if (!['stdio', 'http'].includes(type)) throw new HttpError(400, 'type must be "stdio" or "http"', 'bad_input');
  const out = { type, enabled: cfg.enabled !== false, allowedTools: null, description: typeof cfg.description === 'string' ? cfg.description.slice(0, 300) : '' };
  if (cfg.allowedTools !== undefined && cfg.allowedTools !== null) {
    if (!Array.isArray(cfg.allowedTools) || cfg.allowedTools.some(t => typeof t !== 'string' || t.length > 200)) throw new HttpError(400, 'allowedTools must be an array of strings', 'bad_input');
    out.allowedTools = cfg.allowedTools;
  }
  if (type === 'stdio') {
    if (typeof cfg.command !== 'string' || !cfg.command.trim() || cfg.command.length > 500 || cfg.command.includes('\0')) throw new HttpError(400, '"command" is required for stdio servers', 'bad_input');
    out.command = cfg.command;
    out.args = Array.isArray(cfg.args) ? cfg.args.map(a => { if (typeof a !== 'string') throw new HttpError(400, 'args must be strings', 'bad_input'); return a; }) : [];
    out.env = {};
    if (cfg.env) { if (typeof cfg.env !== 'object') throw new HttpError(400, 'env must be an object', 'bad_input'); for (const [k, v] of Object.entries(cfg.env)) { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || typeof v !== 'string') throw new HttpError(400, 'invalid env entry', 'bad_input'); out.env[k] = v; } }
  } else {
    let u; try { u = new URL(cfg.url); } catch { throw new HttpError(400, '"url" is invalid', 'bad_input'); }
    if (!['https:', 'http:'].includes(u.protocol)) throw new HttpError(400, 'url must be http(s)', 'bad_input');
    out.url = u.toString();
    out.headers = {};
    if (cfg.headers) for (const [k, v] of Object.entries(cfg.headers)) { if (!/^[A-Za-z0-9-]+$/.test(k) || typeof v !== 'string') throw new HttpError(400, 'invalid header', 'bad_input'); out.headers[k] = v; }
  }
  return out;
}

/** Hide secret values (env / headers) when returning configs to the browser. */
function mask(sid, s) {
  const m = { id: sid, ...s };
  if (m.env) m.env = Object.fromEntries(Object.keys(m.env).map(k => [k, '••••']));
  if (m.headers) m.headers = Object.fromEntries(Object.keys(m.headers).map(k => [k, '••••']));
  return m;
}

const api = {
  list: () => Object.entries(load().servers).map(([sid, s]) => mask(sid, s)),
  raw: () => load().servers,
  upsert(sid, cfg) {
    vid(sid, 'server id');
    const db = load(); const existing = db.servers[sid];
    const next = validate(cfg);
    // Keep previously stored secrets when the client sends the masked placeholder back.
    for (const bag of ['env', 'headers']) if (existing && next[bag]) for (const k of Object.keys(next[bag])) if (next[bag][k] === '••••' && existing[bag] && existing[bag][k] !== undefined) next[bag][k] = existing[bag][k];
    db.servers[sid] = next; writeJson(file(), db);
    audit.log(existing ? 'mcp.update' : 'mcp.add', { id: sid, type: next.type });
    return mask(sid, next);
  },
  setEnabled(sid, enabled) {
    const db = load(); if (!db.servers[sid]) throw new HttpError(404, 'server not found', 'not_found');
    db.servers[sid].enabled = !!enabled; writeJson(file(), db); audit.log('mcp.enable', { id: sid, enabled: !!enabled });
    return mask(sid, db.servers[sid]);
  },
  remove(sid) {
    const db = load(); if (!db.servers[sid]) throw new HttpError(404, 'server not found', 'not_found');
    delete db.servers[sid]; writeJson(file(), db); logs.delete(sid); audit.log('mcp.remove', { id: sid }); return { ok: true };
  },
  logs: sid => logs.get(sid) || [],
  /** Config in the format `claude --mcp-config` understands (enabled servers only). */
  toClaudeConfig() {
    const mcpServers = {};
    for (const [sid, s] of Object.entries(load().servers)) {
      if (!s.enabled) continue;
      mcpServers[sid] = s.type === 'stdio' ? { command: s.command, args: s.args, env: s.env } : { type: 'http', url: s.url, headers: s.headers };
    }
    return { mcpServers };
  },
  async test(sid, { timeout = 10000 } = {}) {
    const s = load().servers[sid]; if (!s) throw new HttpError(404, 'server not found', 'not_found');
    audit.log('mcp.test', { id: sid, type: s.type });
    addLog(sid, 'info', 'testing connection (' + s.type + ')');
    try {
      const r = s.type === 'stdio' ? await testStdio(sid, s, timeout) : await testHttp(sid, s, timeout);
      const tools = (r.tools || []).map(t => ({ name: t.name, description: (t.description || '').slice(0, 300), allowed: !s.allowedTools || s.allowedTools.includes(t.name) }));
      addLog(sid, 'info', `connected: ${r.serverInfo && r.serverInfo.name || '?'} — ${tools.length} tools`);
      return { ok: true, serverInfo: r.serverInfo, protocolVersion: r.protocolVersion, tools };
    } catch (e) { addLog(sid, 'error', e.message); return { ok: false, error: e.message }; }
  }
};

function testStdio(sid, s, timeout) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...s.env }; delete env.KINGCODE_TOKEN;
    const cp = spawn(s.command, s.args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '', done = false, init = null;
    const finish = (err, val) => { if (done) return; done = true; clearTimeout(timer); try { cp.kill('SIGKILL'); } catch { /* ignore */ } err ? reject(err) : resolve(val); };
    const timer = setTimeout(() => finish(new Error('timed out waiting for the MCP server')), timeout);
    const send = m => cp.stdin.write(JSON.stringify(m) + '\n');
    cp.on('error', e => finish(new Error('cannot start server: ' + e.message)));
    cp.on('exit', c => finish(new Error('server exited early (code ' + c + ')')));
    cp.stderr.on('data', d => addLog(sid, 'stderr', d.toString().trim()));
    cp.stdout.on('data', d => {
      buf += d.toString();
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
        let m; try { m = JSON.parse(line); } catch { addLog(sid, 'warn', 'non-JSON stdout: ' + line.slice(0, 200)); continue; }
        if (m.id === 1) {
          if (m.error) return finish(new Error('initialize failed: ' + (m.error.message || 'error')));
          init = m.result || {};
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        } else if (m.id === 2) {
          finish(m.error ? new Error('tools/list failed: ' + m.error.message) : null, { serverInfo: init && init.serverInfo, protocolVersion: init && init.protocolVersion, tools: (m.result && m.result.tools) || [] });
        }
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'kingcode-bridge', version: '1.0.0' } } });
  });
}

async function rpc(url, headers, body, sessionId) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers, ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  if (!body.id) return { sid: res.headers.get('mcp-session-id') };
  let msg;
  if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
    for (const block of text.split('\n\n')) { const d = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join(''); if (d) { try { const m = JSON.parse(d); if (m.id === body.id) { msg = m; break; } } catch { /* skip */ } } }
  } else msg = JSON.parse(text);
  if (!msg) throw new Error('no response to ' + body.method);
  if (msg.error) throw new Error(msg.error.message || 'rpc error');
  return { result: msg.result, sid: res.headers.get('mcp-session-id') };
}

async function testHttp(sid, s, timeout) {
  const ac = setTimeout(() => {}, timeout); // overall guard is per-request (10s)
  try {
    const a = await rpc(s.url, s.headers, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'kingcode-bridge', version: '1.0.0' } } });
    await rpc(s.url, s.headers, { jsonrpc: '2.0', method: 'notifications/initialized' }, a.sid);
    const b = await rpc(s.url, s.headers, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, a.sid);
    return { serverInfo: a.result.serverInfo, protocolVersion: a.result.protocolVersion, tools: (b.result && b.result.tools) || [] };
  } finally { clearTimeout(ac); }
}

module.exports = api;
