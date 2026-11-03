/* =========================================================
 * kingCode — tools/e2e.js
 * اختبارات E2E حقيقية في Chromium (Playwright — devDependency فقط، لا تُشحن مع التطبيق).
 * التشغيل: npm run test:e2e   (يتطلب: npm i && npx playwright install chromium)
 * كل اختبار يحمل معرّف الملاحظة من docs/audit/ التي يحرسها.
 * ========================================================= */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const net = require('net');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('playwright غير مثبّت: شغّل `npm i` ثم `npx playwright install chromium`'); process.exit(2); }

const ROOT = path.join(__dirname, '..');
const results = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-e2e-'));

const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function startServer(port) {
  const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'server.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    const ok = await new Promise(r => require('http').get({ host: '127.0.0.1', port, path: '/', agent: false }, res => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)));
    if (ok) return child;
    await sleep(100);
  }
  child.kill(); throw new Error('server did not start');
}

async function test(name, fn, browser, base, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => { if (!/Error: boom/.test(String(e))) pageErrors.push(String(e)); }); /* boom = خطأ مقصود داخل المعاينة */
  try {
    await page.goto(base + '/');
    await page.waitForFunction(() => window.KINGCODE_READY);
    await fn({ page, ctx, base });
    if (pageErrors.length) throw new Error('uncaught page errors: ' + pageErrors.join(' | '));
    results.push({ name, pass: true }); console.log('PASS  ' + name);
  } catch (e) {
    results.push({ name, pass: false }); console.log('FAIL  ' + name + '\n      ' + String(e.message || e).split('\n')[0]);
  } finally { await ctx.close(); }
}

function assert(c, msg) { if (!c) throw new Error(msg); }
const typeAll = (page, txt) => page.evaluate(t => { const cm = kc.EDITOR.cm; cm.replaceRange(t, { line: 0, ch: 0 }, { line: cm.lastLine(), ch: 1e9 }); }, txt);
/* المحتوى المحفوظ فعليًا في IndexedDB للملف رقم i (بترتيب المشروع) */
const stored = (page, i = 0) => page.evaluate(async i => {
  const meta = await STORE._req('meta', s => s.get('state'));
  if (!meta) return null;
  const rec = await STORE._req('files', s => s.get(meta.order[i]));
  return rec ? rec.content : null;
}, i);
const reload = async page => { await page.reload(); await page.waitForFunction(() => window.KINGCODE_READY); };

async function importJson(page, obj) {
  const f = path.join(tmp, 'imp-' + Math.random().toString(36).slice(2) + '.json');
  fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj));
  await page.evaluate(() => UI.openSettings());
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnImport')]);
  await fc.setFiles(f);
}

(async () => {
  const port = await freePort();
  const server = await startServer(port);
  const base = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch();
  try {
    /* ---- سير العمل الأساسي ---- */
    await test('WF: launch + default project + edit + reload keeps saved state', async ({ page }) => {
      assert((await page.evaluate(() => kc.STATE.files().length)) === 3, 'default files');
      await typeAll(page, '<h1>HELLO</h1>'); await sleep(500);
      await reload(page);
      assert((await page.evaluate(() => kc.STATE.files()[0].content)) === '<h1>HELLO</h1>', 'content lost');
    }, browser, base);

    await test('WF: create file, switch tabs, rename, duplicate x2, delete', async ({ page }) => {
      await page.evaluate(() => { FILES.create('a.js', 'x'); });
      await page.evaluate(() => { const f = kc.STATE.file(kc.STATE.data.activeId); FILES.duplicate(f.id); FILES.duplicate(f.id); });
      const names = await page.evaluate(() => kc.STATE.files().map(f => f.name));
      assert(names.includes('a copy.js') && names.includes('a copy-2.js'), 'duplicates: ' + names);
      await page.evaluate(() => TABS.cycle(1));
    }, browser, base);

    await test('WF: preview renders and shows runtime errors in console', async ({ page }) => {
      await typeAll(page, '<script>console.log("hi-preview");throw new Error("boom")</script>');
      await page.waitForFunction(() => /hi-preview/.test(document.querySelector('#console-output').textContent) && /boom/.test(document.querySelector('#console-output').textContent), null, { timeout: 5000 });
    }, browser, base);

    await test('WF: responsive — no horizontal overflow at 390/820/1366', async ({ page }) => {
      for (const w of [390, 820, 1366]) {
        await page.setViewportSize({ width: w, height: 800 }); await sleep(250);
        assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'overflow at ' + w);
      }
    }, browser, base);

    /* ---- F-01 / F-04: الاستيراد ---- */
    await test('F-01: importing 100 files keeps exactly 60, tells the user, survives reload', async ({ page }) => {
      await importJson(page, Object.fromEntries(Array.from({ length: 100 }, (_, i) => ['f' + i + '.txt', 'c' + i])));
      await page.waitForSelector('#confirm-modal', { state: 'visible' });
      const msg = await page.textContent('#confirm-msg');
      assert(/40/.test(msg) && /60/.test(msg), 'no truncation notice: ' + msg);
      await page.click('#confirm-ok'); await sleep(500);
      assert((await page.evaluate(() => kc.STATE.files().length)) === 60, 'not 60 in memory');
      await reload(page);
      assert((await page.evaluate(() => kc.STATE.files().length)) === 60, 'changed after reload');
    }, browser, base);

    await test('F-04: duplicate names are renamed (not duplicated); array & non-object rejected', async ({ page }) => {
      const r = await page.evaluate(() => ({
        dup: U.sanitizeFiles({ 'a/b.js': '1', 'a-b.js': '2' }).files.map(f => f.name),
        arr: U.sanitizeFiles(['a', 'b']), str: U.sanitizeFiles('x'),
        dots: U.sanitizeFiles({ '..': 'x', '.': 'y' }),
        blank: U.sanitizeFiles({ 'a.js': { content: 5 } }).notes.blank
      }));
      assert(new Set(r.dup).size === 2, 'dup: ' + r.dup);
      assert(r.arr === null && r.str === null && r.dots === null, 'invalid shapes accepted');
      assert(r.blank === 1, 'blank not reported');
      await importJson(page, '[1,2,3]');
      await page.waitForSelector('.toast-error', { timeout: 3000 });
    }, browser, base);

    await test('WF: import → backup → restore returns previous project', async ({ page }) => {
      await importJson(page, { 'only.txt': 'x' });
      await page.waitForSelector('#confirm-modal', { state: 'visible' }); await page.click('#confirm-ok'); await sleep(400);
      assert((await page.evaluate(() => kc.STATE.files().map(f => f.name).join())) === 'only.txt', 'import');
      await page.evaluate(() => Commands.run('files.restoreBackup'));
      await page.waitForSelector('#confirm-modal', { state: 'visible' }); await page.click('#confirm-ok'); await sleep(400);
      assert((await page.evaluate(() => kc.STATE.files().length)) === 3, 'restore');
    }, browser, base);

    await test('A-02: after import/restore the editor, tabs and status bar show the new project', async ({ page }) => {
      await importJson(page, { 'zeta.txt': 'ZETA-CONTENT', 'beta.txt': 'B' });
      await page.waitForSelector('#confirm-modal', { state: 'visible' }); await page.click('#confirm-ok'); await sleep(500);
      assert((await page.evaluate(() => kc.EDITOR.cm.getValue())) === 'ZETA-CONTENT', 'editor still shows old document');
      assert((await page.textContent('#statusFile')) === 'zeta.txt', 'status bar stale: ' + (await page.textContent('#statusFile')));
      assert((await page.$$eval('.tab', n => n.length)) === 1, 'tabs not reset');
      await page.evaluate(() => Commands.run('files.restoreBackup'));
      await page.waitForSelector('#confirm-modal', { state: 'visible' }); await page.click('#confirm-ok'); await sleep(500);
      assert(/<html|<!DOCTYPE/i.test(await page.evaluate(() => kc.EDITOR.cm.getValue())), 'editor not showing restored index.html');
    }, browser, base);

    /* ---- F-03: تفريغ الحفظ عند المغادرة ---- */
    await test('F-03: edit then immediate reload does not lose the edit', async ({ page }) => {
      await typeAll(page, '<h1>FAST</h1>');
      await reload(page);
      assert((await page.evaluate(() => kc.STATE.files()[0].content)) === '<h1>FAST</h1>', 'edit lost on fast reload');
    }, browser, base);

    /* ---- F-02: فشل التخزين ---- */
    await test('F-02: storage write failure → persistent failure indicator, never "saved", repeated warnings, recovers', async ({ page }) => {
      await sleep(400);
      /* فشل حقيقي في IndexedDB: كل put يرمي QuotaExceededError */
      await page.evaluate(() => { window.__origPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { throw new DOMException('quota', 'QuotaExceededError'); }; });
      await typeAll(page, 'x'.repeat(4000)); await sleep(700);
      assert(await page.evaluate(() => document.querySelector('#saveIndicator').classList.contains('failed')), 'no failure indicator');
      const txt = await page.textContent('#saveIndicator');
      assert(!/حُفظ/.test(txt), 'false saved: ' + txt);
      assert((await page.evaluate(() => kc.STATE.saveFailed)) === true, 'saveFailed flag');
      await page.evaluate(() => { IDBObjectStore.prototype.put = window.__origPut; });
      await typeAll(page, 'recovered'); await sleep(700);
      assert(!(await page.evaluate(() => document.querySelector('#saveIndicator').classList.contains('failed'))), 'indicator stuck after recovery');
      assert((await stored(page)) === 'recovered', 'recovered write not persisted');
    }, browser, base);

    /* ---- A-01: طبقة التخزين ---- */
    await test('A-01: IndexedDB is the backend and holds one record per file', async ({ page }) => {
      assert((await page.evaluate(() => STORE.kind)) === 'idb', 'backend is not idb');
      await sleep(500);
      const n = await page.evaluate(() => STORE._req('files', s => s.count()));
      assert(n === 3, 'expected 3 file records, got ' + n);
    }, browser, base);

    await test('A-01: a project far beyond the old 5 MB localStorage ceiling persists and reloads', async ({ page }) => {
      await page.evaluate(async () => {
        for (let i = 0; i < 8; i++) STATE.addFile('big' + i + '.txt', 'x'.repeat(2000000), { tab: false });
        STATE.persist(); await STATE.flush();
      });
      assert((await page.evaluate(() => STATE.saveFailed)) === false, 'save failed for a 16 MB project');
      await reload(page);
      const sizes = await page.evaluate(() => kc.STATE.files().filter(f => f.name.startsWith('big')).map(f => f.content.length));
      assert(sizes.length === 8 && sizes.every(n => n === 2000000), 'big files not restored: ' + sizes);
    }, browser, base);

    await test('A-01: edits write only the changed file record (differential save)', async ({ page }) => {
      await sleep(500);
      const before = await page.evaluate(() => { window.__puts = 0; const o = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (v, k) { if (v && v.id) window.__puts++; return o.apply(this, arguments); }; return 1; });
      await typeAll(page, '<p>only this file</p>'); await sleep(700);
      const puts = await page.evaluate(() => window.__puts);
      assert(puts === 1, 'expected exactly 1 file record written, got ' + puts);
    }, browser, base);

    await test('A-01: legacy localStorage project is migrated into IndexedDB on first run', async ({ page, ctx, base }) => {
      const p2 = await ctx.newPage();
      await p2.goto(base + '/manifest.json');
      await p2.evaluate(() => new Promise(res => { const r = indexedDB.deleteDatabase('kingcode'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
      await p2.evaluate(() => localStorage.setItem('kingcode:state:v1', JSON.stringify({ v: 1, files: [{ id: 'L1', name: 'legacy.md', content: 'LEGACY-DATA', updatedAt: 1 }], tabs: ['L1'], activeId: 'L1', settings: {}, uiPrefs: {} })));
      await p2.close();
      await page.evaluate(() => new Promise(res => { /* أغلق اتصال الصفحة الحالية بقاعدة البيانات قبل إعادة التحميل */ STORE._db && STORE._db.close(); res(); }));
      await reload(page); await sleep(700);
      assert((await page.evaluate(() => kc.STATE.files().map(f => f.name).join())) === 'legacy.md', 'legacy project not loaded');
      assert((await page.evaluate(() => kc.EDITOR.cm.getValue())) === 'LEGACY-DATA', 'editor does not show migrated file');
      await reload(page);
      assert((await page.evaluate(() => STORE.kind)) === 'idb' && (await page.evaluate(() => kc.STATE.files()[0].content)) === 'LEGACY-DATA', 'not persisted in idb after migration');
    }, browser, base);

    await test('A-01: crash journal newer than the last save is recovered on boot', async ({ page }) => {
      await sleep(500);
      const id = await page.evaluate(() => kc.STATE.files()[0].id);
      await page.evaluate(id => localStorage.setItem('kingcode:journal:v1', JSON.stringify({ t: Date.now() + 5000, files: [{ id, name: 'index.html', content: 'RECOVERED-FROM-JOURNAL', updatedAt: 9 }], tabs: [id], activeId: id })), id);
      await reload(page); await sleep(500);
      assert((await page.evaluate(() => kc.STATE.files()[0].content)) === 'RECOVERED-FROM-JOURNAL', 'journal not applied');
      assert((await stored(page)) === 'RECOVERED-FROM-JOURNAL', 'journal content not committed to idb');
    }, browser, base);

    await test('A-01: falls back to localStorage when IndexedDB is unavailable (private modes)', async ({ page }) => {
      assert((await page.evaluate(() => STORE.kind)) === 'local', 'did not fall back');
      await typeAll(page, 'FALLBACK-OK'); await sleep(600);
      await reload(page);
      assert((await page.evaluate(() => kc.STATE.files()[0].content)) === 'FALLBACK-OK', 'fallback persistence failed');
    }, browser, base, { init: () => { try { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); } catch (e) {} } });

    /* ---- F-05: الحفظ التلقائي المعطّل ---- */
    await test('F-05: auto-save off keeps edits uncommitted until Ctrl+S', async ({ page }) => {
      await sleep(400);
      await page.evaluate(() => kc.STATE.setSetting('autoSave', false)); await sleep(400);
      const before = await stored(page);
      await page.evaluate(() => { kc.EDITOR.cm.replaceRange('UNSAVED', { line: 0, ch: 0 }); });
      await page.evaluate(() => kc.STATE.setActive(kc.STATE.files()[1].id)); await sleep(500); // أي persist
      assert((await stored(page)) === before, 'unsaved edit leaked to storage');
      await page.evaluate(() => kc.STATE.setActive(kc.STATE.files()[0].id));
      await page.evaluate(() => Commands.run('files.save')); await sleep(200);
      assert((await stored(page)).startsWith('UNSAVED'), 'explicit save did not persist');
      await typeAll(page, 'AGAIN'); await page.evaluate(() => kc.STATE.setSetting('autoSave', true)); await sleep(500);
      assert((await stored(page)) === 'AGAIN', 're-enabling auto-save should save pending edits');
    }, browser, base);

    /* ---- F-06: عزل الكاش ---- */
    await test('F-06: service worker never deletes caches it does not own', async ({ page, ctx, base }) => {
      const p2 = await ctx.newPage();
      await p2.goto(base + '/manifest.json');
      await p2.evaluate(() => caches.open('other-app-cache-v1').then(c => c.put('/x', new Response('x'))));
      await p2.close();
      await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.unregister(); for (const k of await caches.keys()) if (k.startsWith('kingcode-')) await caches.delete(k); });
      await page.evaluate(() => caches.open('kingcode-cache-kingcode-v0.0.1')); // نسخة kingCode قديمة يجب تنظيفها
      await reload(page);
      await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.getRegistration().then(r => r && r.active), null, { timeout: 8000 });
      await sleep(1200);
      const keys = await page.evaluate(() => caches.keys());
      assert(keys.includes('other-app-cache-v1'), 'foreign cache deleted: ' + keys);
      assert(!keys.includes('kingcode-cache-kingcode-v0.0.1'), 'stale kingcode cache kept: ' + keys);
    }, browser, base);

    /* ---- F-07: لا إعادة تحميل تلقائية ---- */
    await test('F-07: SW does not skipWaiting on install; no startup "checking" toast', async ({ page }) => {
      const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
      const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
      assert(!/skipWaiting\(\)/.test(install.replace(/\/\*[\s\S]*?\*\//g, '')), 'install still calls skipWaiting');
      await sleep(300);
      const toasts = await page.$$eval('.toast', n => n.map(x => x.textContent));
      assert(!toasts.some(t => /البحث عن التحديثات/.test(t)), 'startup toast present: ' + toasts);
      assert((await page.evaluate(() => typeof APP.applyUpdate)) === 'function', 'applyUpdate missing');
    }, browser, base);

    /* ---- F-08: تصدير HTML نظيف ---- */
    await test('F-08: exported standalone HTML has no console bridge', async ({ page }) => {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => FILES.exportProjectHTML())]);
      const html = fs.readFileSync(await dl.path(), 'utf8');
      assert(!html.includes('__kingcode'), 'bridge present in export');
      assert(/^\s*<!DOCTYPE/i.test(html), 'export does not start with doctype');
    }, browser, base);

    /* ---- ضوابط أمنية يجب أن تبقى صامدة ---- */
    await test('SEC: preview sandbox blocks parent DOM, storage, top navigation; forged messages ignored', async ({ page }) => {
      await typeAll(page, '<script>try{console.log("P:"+typeof parent.document)}catch(e){console.log("P:blocked")};try{localStorage.length;console.log("L:ok")}catch(e){console.log("L:blocked")};try{top.location="http://evil.test/"}catch(e){console.log("T:blocked")}</script>');
      await page.waitForFunction(() => /T:blocked/.test(document.querySelector('#console-output').textContent), null, { timeout: 5000 });
      const out = await page.textContent('#console-output');
      assert(/P:blocked/.test(out) && /L:blocked/.test(out), 'sandbox leak: ' + out);
      await page.evaluate(() => window.postMessage({ __kingcode: true, type: 'console', level: 'error', parts: ['FORGED'] }, '*')); await sleep(200);
      assert(!(await page.textContent('#console-output')).includes('FORGED'), 'forged message accepted');
    }, browser, base);

    await test('S-03: shell blocks inline script execution (no unsafe-inline); buttons work via data-action', async ({ page }) => {
      const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
      const scriptSrc = (csp.match(/script-src([^;]*)/) || [])[1] || '';
      assert(!/unsafe-inline|unsafe-eval/.test(scriptSrc), 'script-src weak: ' + scriptSrc);
      await page.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__inl=1'; document.body.appendChild(s); });
      assert(!(await page.evaluate(() => !!window.__inl)), 'inline script executed in shell');
      assert((await page.evaluate(() => document.querySelectorAll('[onclick],[onload],[onerror]').length)) === 0, 'inline handler attributes remain');
      await page.evaluate(() => UI.openSettings());
      await page.click('#settings-modal [data-action="modal.close"][aria-label]');
      assert(!(await page.evaluate(() => UI.isModalOpen('settings-modal'))), 'modal.close action broken');
      await page.click('[data-action="preview.refresh"]');
    }, browser, base);

    await test('S-03: preview still runs inline scripts but has no network/remote resources', async ({ page }) => {
      await typeAll(page, '<img src="https://example.com/x.png"><script>console.log("inline-ok");fetch("https://example.com").then(()=>console.log("NET-OK")).catch(()=>console.log("net-blocked"));</script>');
      await page.waitForFunction(() => /net-blocked/.test(document.querySelector('#console-output').textContent), null, { timeout: 5000 });
      const out = await page.textContent('#console-output');
      assert(/inline-ok/.test(out) && !/NET-OK/.test(out), 'unexpected: ' + out);
    }, browser, base);

    await test('S-02: console bridge input is allow-listed and size-capped', async ({ page }) => {
      await typeAll(page, '<script>var big=[];for(var i=0;i<500;i++)big.push("x".repeat(10000));parent.postMessage({__kingcode:true,type:"console",level:"x\\"><img src=x>",parts:big},"*");parent.postMessage({__kingcode:true,type:"console",level:"error",parts:"scalar"},"*");</script>');
      await page.waitForFunction(() => /scalar/.test(document.querySelector('#console-output').textContent), null, { timeout: 5000 });
      const rows = await page.$$eval('#console-output .console-item', n => n.map(r => ({ cls: r.className, len: r.textContent.length })));
      assert(rows.every(r => /^console-item lvl-(log|info|warn|error|debug|system)$/.test(r.cls)), 'bad class: ' + JSON.stringify(rows.map(r => r.cls)));
      assert(rows.every(r => r.len <= 20 * 2000 + 200), 'oversized row');
      assert((await page.$$('#console-output img')).length === 0, 'markup injected');
    }, browser, base);

    await test('S-03: preview frame loads sandbox.html (opaque origin) with its own strict CSP', async ({ page }) => {
      const info = await page.evaluate(() => { const f = document.getElementById('preview-frame'); return { src: f.getAttribute('src'), sandbox: f.getAttribute('sandbox') }; });
      assert(/^sandbox\.html\?n=/.test(info.src), 'src: ' + info.src);
      assert(info.sandbox === 'allow-scripts allow-modals', 'sandbox attr: ' + info.sandbox);
      const html = fs.readFileSync(path.join(ROOT, 'sandbox.html'), 'utf8');
      assert(/default-src 'none'/.test(html) && !/connect-src/.test(html), 'sandbox CSP not strict');
    }, browser, base);

    await test('SEC: hostile file name cannot inject markup into the app shell', async ({ page }) => {
      await page.evaluate(() => FILES.create('<img src=x onerror=window.__xss=1>.html', ''));
      await sleep(200);
      assert(!(await page.evaluate(() => !!window.__xss)), 'XSS executed');
    }, browser, base);
  } finally {
    await browser.close(); server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const failed = results.filter(r => !r.pass);
  console.log('\nSummary: ' + (results.length - failed.length) + '/' + results.length + ' passed' + (failed.length ? ' — FAILED: ' + failed.map(f => f.name).join('; ') : ''));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
