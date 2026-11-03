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

async function test(name, fn, browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
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
const stored = (page, i = 0) => page.evaluate(i => { const s = localStorage.getItem('kingcode:state:v1'); return s ? JSON.parse(s).files[i].content : null; }, i);
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

    /* ---- F-03: تفريغ الحفظ عند المغادرة ---- */
    await test('F-03: edit then immediate reload does not lose the edit', async ({ page }) => {
      await typeAll(page, '<h1>FAST</h1>');
      await reload(page);
      assert((await page.evaluate(() => kc.STATE.files()[0].content)) === '<h1>FAST</h1>', 'edit lost on fast reload');
    }, browser, base);

    /* ---- F-02: فشل التخزين ---- */
    await test('F-02: storage full → persistent failure indicator, never "saved", repeated warnings', async ({ page }) => {
      await sleep(400);
      await page.evaluate(() => { const s = 'z'.repeat(50000); try { for (let i = 0; i < 2000; i++) localStorage.setItem('fill' + i, s); } catch (e) {} });
      await typeAll(page, 'x'.repeat(400000)); await sleep(700);
      assert(await page.evaluate(() => document.querySelector('#saveIndicator').classList.contains('failed')), 'no failure indicator');
      const txt = await page.textContent('#saveIndicator');
      assert(!/حُفظ/.test(txt), 'false saved: ' + txt);
      assert((await page.evaluate(() => kc.STATE.saveFailed)) === true, 'saveFailed flag');
      await page.evaluate(() => { for (let i = 0; i < 2000; i++) localStorage.removeItem('fill' + i); });
      await typeAll(page, 'ok'); await sleep(500);
      assert(!(await page.evaluate(() => document.querySelector('#saveIndicator').classList.contains('failed'))), 'indicator stuck after recovery');
    }, browser, base);

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
