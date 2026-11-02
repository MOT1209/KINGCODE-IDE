/* =========================================================
 * kingCode — tools/ci-smoke.js
 * مجموعة تحقق Zero-Dependency (Node stdlib فقط) — تشغيل: `npm test`
 *
 * تغطي حراس الانحدار الموثقة في docs/audit/:
 *   CB-02 — السيرفر لا ينهار على مسار معبّر (%URLEncode) → 400 والسيرفر حي
 *   CB-04 — عبور الجذر مرفوض (403) بلا أوراكل وجود للمسارات الخارجية
 *   SC-08 — لا ترويسة Access-Control-Allow-Origin عامة على أي استجابة
 *   SC-09 — `application/json` للملفات عامة و`application/manifest+json` للـ manifest فقط
 *   CB-08 — ائتلاف الإصدارات: js/config.js ↔ service-worker.js ↔ CHANGELOG
 *           (القاعدة الملزمة: كل تغيير أصل يتطلب رفعة كاش SW بنفس الكوميت)
 *   SC-04 — meta CSP + sandbox التضييقان موجودان في index.html
 * ========================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
let results = [];
let child = null;

/* ---------- أدوات ---------- */

function freePort() {
  return new Promise(resolve => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

function httpGet(port, urlPath, timeoutMs) {
  const t = timeoutMs || 5000;
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, agent: false }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.setTimeout(t, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function record(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : ''));
}

/* حراسات ثابتة (لا تحتاج سيرفر) */
function staticChecks() {
  const cfg = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  const cl = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  const mApp = cfg.match(/version:\s*'kingCode '\s*\+\s*'([\d.]+)'/);
  const mSw = sw.match(/const VERSION = 'kingcode-v([\d.]+)'/);
  const appV = mApp ? mApp[1] : null;
  const swV = mSw ? mSw[1] : null;

  record('CB-08: version(alias app) found in js/config.js', !!appV, 'kc.version=' + appV);
  record('CB-08: version found in service-worker.js', !!swV, 'SW=' + swV);
  record('CB-08: app version == SW cache version', !!appV && appV === swV);
  record('CB-08: CHANGELOG has "## [' + appV + ']" entry', !!appV && cl.indexOf('## [' + appV + ']') !== -1);

  record('SC-04: index.html declares meta CSP', html.indexOf('Content-Security-Policy') !== -1);
  record('SC-04: index.html preview sandbox tight (allow-scripts allow-modals)', html.indexOf('sandbox="allow-scripts allow-modals"') !== -1);

  return appV && swV && appV === swV;
}

/* حراسات HTTP (سيرفر حي على منفذ حر) */
async function serverChecks(port) {
  /* CB-02: مسار معبّر لا يقتل العملية */
  const bad1 = await httpGet(port, '/%');
  record('CB-02: GET /%  -> 400 (was: server exited 1)', !!bad1 && bad1.status === 400, 'status=' + (bad1 && bad1.status));
  const bad2 = await httpGet(port, '/foo%bar');
  record('CB-02: GET /foo%bar -> 400', !!bad2 && bad2.status === 400, 'status=' + (bad2 && bad2.status));
  /* السيرفر ما زال حيًا بعد الطلبات المعبّرة */
  const alive = await httpGet(port, '/js/config.js');
  record('CB-02: server still serves after malformed URLs', !!alive && alive.status === 200, 'status=' + (alive && alive.status));

  /* CB-04: عبور الجذر */
  const trav = await httpGet(port, '/..%2f..%2fREADME.md');
  record('CB-04: GET /..%2f../README.md -> 403 (was: 200)', !!trav && trav.status === 403, 'status=' + (trav && trav.status));
  const travMiss = await httpGet(port, '/..%2f..%2fmissing.md');
  record('CB-04: missing outside-root path -> 403 (no existence oracle)', !!travMiss && travMiss.status === 403, 'status=' + (travMiss && travMiss.status));

  /* SC-08: لا CORS عام */
  for (const [label, r] of [['/', await httpGet(port, '/')], ['/manifest.json', await httpGet(port, '/manifest.json')]]) {
    const acao = r && r.headers && r.headers['access-control-allow-origin'];
    record('SC-08: no wildcard ACAO on ' + label, !acao, acao ? 'ACAO=' + acao : 'absent');
  }

  /* SC-09: MIME الصحيح */
  const man = await httpGet(port, '/manifest.json');
  record('SC-09: manifest.json -> application/manifest+json',
    !!man && (man.headers['content-type'] || '').indexOf('application/manifest+json') === 0,
    'ct=' + (man && man.headers['content-type']));
  const json = await httpGet(port, '/service-worker.js');
  record('SC-09: generic served file keeps its own MIME', !!json && (json.headers['content-type'] || '').indexOf('text/javascript') === 0,
    'ct=' + (json && json.headers['content-type']));

  /* الصفحة الرئيسية */
  const home = await httpGet(port, '/');
  record('GET / -> 200 text/html (app reachable)', !!home && home.status === 200 && (home.headers['content-type'] || '').indexOf('text/html') === 0,
    'status=' + (home && home.status));
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    let out = '';
    child = spawn(process.execPath, [path.join(ROOT, 'tools', 'server.js')], {
      env: Object.assign({}, process.env, { PORT: String(port), HOST: '127.0.0.1' }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('exit', code => { if (code !== null && code !== 0) reject(new Error('server exited early (' + code + '):\n' + out)); });
    /* انتظر الجاهزية */
    let tries = 0;
    const tick = async () => {
      tries++;
      const r = await httpGet(port, '/js/config.js', 1500);
      if (r && r.status === 200) return resolve(port);
      if (tries > 50) return reject(new Error('server did not become ready:\n' + out));
      setTimeout(tick, 100);
    };
    setTimeout(tick, 200);
  });
}

/* ---------- التنفيذ ---------- */

(async () => {
  console.log('kingCode zero-dep smoke suite — docs/audit regression guards\n');
  const versionsOk = staticChecks();
  let serverOk = false;
  try {
    const port = await freePort();
    await startServer(port);
    await serverChecks(port);
    serverOk = true;
  } catch (e) {
    record('server bootstrap', false, String(e.message || e).slice(0, 300));
  } finally {
    if (child) { try { child.kill(); } catch (_) {} }
  }
  const failed = results.filter(r => !r.pass);
  console.log('\nSummary: ' + (results.length - failed.length) + '/' + results.length + ' passed' +
    (failed.length ? ' — FAILED: ' + failed.map(f => f.name).join(', ') : ''));
  console.log('Static version checks: ' + (versionsOk ? 'OK' : 'BLOCKED (fix versions before server phase matters)'));
  process.exit((failed.length || !serverOk) ? 1 : 0);
})();
