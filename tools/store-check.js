/* =========================================================
 * kingCode — tools/store-check.js
 * فحص جاهزية PWA للمتاجر (صفر تبعيات — Node فقط): npm run store:check
 * يتحقق من ما يمكن التحقق منه محليًا: manifest، الأيقونات واللقطات (وأبعاد PNG الفعلية)، الخصوصية، الـ service worker،
 * إعدادات الترويسات، وغياب مراجع غير آمنة. لا يستطيع التحقق من: حسابات المتاجر، التوقيع، النشر الفعلي، الأجهزة.
 * ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const results = [];
const rec = (name, pass, detail) => { results.push({ name, pass }); console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : '')); };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = f => fs.existsSync(path.join(ROOT, f));

function pngSize(file) {
  const b = fs.readFileSync(path.join(ROOT, file));
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null;
  return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20);
}

/* ---------- manifest ---------- */
let m = null;
try { m = JSON.parse(read('manifest.json')); rec('manifest.json is valid JSON', true); }
catch (e) { rec('manifest.json is valid JSON', false, e.message); }

if (m) {
  for (const k of ['name', 'short_name', 'start_url', 'scope', 'id', 'lang', 'dir', 'theme_color', 'background_color', 'description']) {
    rec('manifest has "' + k + '"', !!m[k]);
  }
  rec('manifest display is standalone', m.display === 'standalone');
  rec('manifest start_url is inside scope (relative, same directory)', typeof m.start_url === 'string' && m.start_url.startsWith('./') && m.scope === './');
  rec('manifest has no absolute http:// URLs (mixed content)', !/http:\/\//.test(JSON.stringify(m)));

  const icons = m.icons || [];
  const has = (size, purpose) => icons.some(i => i.sizes === size && i.type === 'image/png' && (i.purpose || 'any') === purpose);
  for (const [s, p] of [['192x192', 'any'], ['512x512', 'any'], ['192x192', 'maskable'], ['512x512', 'maskable']]) {
    rec('icon ' + s + ' (' + p + ') declared', has(s, p));
  }
  for (const i of icons) {
    if (i.type !== 'image/png') continue;
    const ok = exists(i.src); const dim = ok ? pngSize(i.src) : null;
    rec('icon file exists with the declared size: ' + i.src, ok && dim === i.sizes, 'declared ' + i.sizes + ', actual ' + dim);
  }

  const shots = m.screenshots || [];
  rec('manifest has >= 2 screenshots', shots.length >= 2, String(shots.length));
  rec('screenshots cover both form factors (wide + narrow)', shots.some(s => s.form_factor === 'wide') && shots.some(s => s.form_factor === 'narrow'));
  for (const s of shots) {
    const ok = exists(s.src); const dim = ok ? pngSize(s.src) : null;
    rec('screenshot exists with the declared size: ' + s.src, ok && dim === s.sizes, 'declared ' + s.sizes + ', actual ' + dim);
  }
  rec('narrow screenshots are 9:16 (Play requirement to verify: 16:9 or 9:16)', shots.filter(s => s.form_factor === 'narrow').every(s => { const [w, h] = s.sizes.split('x').map(Number); return Math.abs(w / h - 9 / 16) < 0.01; }));

  for (const sc of (m.shortcuts || [])) rec('shortcut url is relative: ' + sc.url, /^\.\//.test(sc.url));
}

/* ---------- service worker + app shell ---------- */
const html = read('index.html');
const sw = read('service-worker.js');
const appjs = read('js/app.js');
rec('index.html links the manifest', /<link rel="manifest" href="manifest\.json"/.test(html));
rec('service worker is registered by the app', /serviceWorker\.register\('\.\/service-worker\.js'\)/.test(appjs));
const assets = [...sw.matchAll(/^ {2}'([^']+)'/gm)].map(x => x[1]);
rec('every precached asset exists on disk', assets.filter(a => a !== './' && !exists(a)).length === 0, assets.filter(a => a !== './' && !exists(a)).join(','));
rec('precache includes the offline essentials', ['index.html', 'manifest.json', 'sandbox.html', 'privacy.html', 'js/app.js', 'css/main.css'].every(a => assets.includes(a)));

/* ---------- privacy ---------- */
rec('privacy.html exists', exists('privacy.html'));
if (exists('privacy.html')) {
  const p = read('privacy.html');
  rec('privacy.html has Arabic and English sections', /lang="ar"/.test(p) && /lang="en"/.test(p));
  rec('privacy.html contains no scripts', !/<script/i.test(p));
  rec('privacy.html states "no data collected / no cookies"', /لا يجمع بياناتك/.test(p) && /does not collect your data/.test(p) && /cookies/i.test(p));
}
rec('the app links to the privacy page', /href="privacy\.html"/.test(html));

/* ---------- honesty: the app must not contain claims that the listing/docs rely on being false ---------- */
/* التعليقات تُحذف أولًا: تعليق يذكر fetch/WebSocket لا يعني استدعاءً */
const stripComments = t => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*$/gm, '$1');
const shipped = stripComments(['index.html', 'privacy.html', 'sandbox.html'].map(read).join('\n') + assets.filter(a => /^js\//.test(a)).map(read).join('\n'));
rec('shipped code makes no network calls other than the service worker', !/XMLHttpRequest|WebSocket|sendBeacon|navigator\.sendBeacon/.test(shipped) && (shipped.match(/\bfetch\(/g) || []).length === 0);
rec('shipped code sets no cookies', !/document\.cookie/.test(shipped));

/* ---------- hosting headers ---------- */
let vj = null;
try { vj = JSON.parse(read('vercel.json')); rec('vercel.json is valid JSON', true); } catch (e) { rec('vercel.json is valid JSON', false, e.message); }
if (vj) {
  const rules = vj.headers || [];
  const hdr = (rule, key) => (rule.headers.find(h => h.key.toLowerCase() === key.toLowerCase()) || {}).value;
  const cspRules = rules.filter(r => hdr(r, 'content-security-policy') !== undefined);
  rec("exactly one rule sets Content-Security-Policy, and it is \"frame-ancestors 'self'\" (a second frame-ancestors rule could block the preview frame)",
    cspRules.length === 1 && hdr(cspRules[0], 'content-security-policy') === "frame-ancestors 'self'");
  const all = rules.find(r => r.source === '/(.*)');
  rec('global rule sets nosniff, no-referrer, Permissions-Policy, HSTS', !!all && hdr(all, 'x-content-type-options') === 'nosniff' && hdr(all, 'referrer-policy') === 'no-referrer' && !!hdr(all, 'permissions-policy') && !!hdr(all, 'strict-transport-security'));
  const swr = rules.find(r => r.source === '/service-worker.js');
  rec('service-worker.js is served with Cache-Control: no-cache', !!swr && /no-cache/.test(hdr(swr, 'cache-control') || ''));
  const mr = rules.find(r => r.source === '/manifest.json');
  rec('manifest.json is served as application/manifest+json', !!mr && hdr(mr, 'content-type') === 'application/manifest+json');
}
rec('_headers (Netlify/Cloudflare) exists and matches the policy', exists('_headers') && /frame-ancestors 'self'/.test(read('_headers')) && /\/service-worker\.js\n\s+Cache-Control: no-cache/.test(read('_headers')));

/* ---------- never commit a placeholder Digital Asset Links file ---------- */
rec('no placeholder .well-known/assetlinks.json committed (needs the real signing fingerprint)', !exists('.well-known/assetlinks.json') || !/REPLACE|PLACEHOLDER|00:00:00/i.test(read('.well-known/assetlinks.json')));

/* ---------- docs ---------- */
for (const f of ['docs/store/README.md', 'docs/store/ANDROID.md', 'docs/store/WINDOWS.md', 'docs/store/LISTING.md']) rec('store doc exists: ' + f, exists(f));

const failed = results.filter(r => !r.pass);
console.log('\nSummary: ' + (results.length - failed.length) + '/' + results.length + ' passed' + (failed.length ? ' — FAILED: ' + failed.map(f => f.name).join('; ') : ''));
process.exit(failed.length ? 1 : 0);
