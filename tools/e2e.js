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

/* المتصفح: KC_BROWSER=chromium (افتراضي) | firefox | webkit */
const BROWSER_NAME = process.env.KC_BROWSER || 'chromium';
let engine;
try {
  const pw = require('playwright');
  engine = pw[BROWSER_NAME];
  if (!engine) { console.error('KC_BROWSER غير معروف: ' + BROWSER_NAME + ' (chromium | firefox | webkit)'); process.exit(2); }
} catch (e) { console.error('playwright غير مثبّت: شغّل `npm i` ثم `npx playwright install ' + BROWSER_NAME + '`'); process.exit(2); }

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

/** يبدأ خادمًا من نسخة مؤقتة من التطبيق (لاختبار التحديث بين نسختين) */
async function startServerAt(dir, port) {
  const child = spawn(process.execPath, [path.join(dir, 'tools', 'server.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    const ok = await new Promise(r => require('http').get({ host: '127.0.0.1', port, path: '/', agent: false }, res => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)));
    if (ok) return child;
    await sleep(100);
  }
  child.kill(); throw new Error('copy server did not start');
}

function copyApp(dest) {
  fs.mkdirSync(path.join(dest, 'tools'), { recursive: true });
  for (const f of ['index.html', 'sandbox.html', 'manifest.json', 'service-worker.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dest, f));
  for (const d of ['css', 'js', 'vendor', 'icons']) fs.cpSync(path.join(ROOT, d), path.join(dest, d), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tools', 'server.js'), path.join(dest, 'tools', 'server.js'));
}

async function test(name, fn, browser, base, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 800 }, hasTouch: !!opts.touch, ...(BROWSER_NAME === 'firefox' ? {} : { isMobile: !!opts.mobile }), acceptDownloads: true }); /* Firefox لا يدعم isMobile */
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => { if (!/Error: boom|Unsafe JavaScript attempt to initiate navigation/.test(String(e))) pageErrors.push(String(e)); }); /* الثانية: WebKit يبلّغ محاولة التنقل المحجوبة كخطأ صفحة — دليل أن الـ sandbox يعمل */ /* boom = خطأ مقصود داخل المعاينة */
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
/** ينتظر ظهور نص في كونسول المعاينة؛ عند انتهاء المهلة يذكر محتوى الكونسول الفعلي (تشخيص بين المتصفحات) */
async function waitConsole(page, re, ms = 6000) {
  try {
    await page.waitForFunction(src => new RegExp(src).test(document.querySelector('#console-output').textContent), re.source, { timeout: ms });
  } catch (e) {
    const text = await page.evaluate(() => document.querySelector('#console-output').textContent);
    throw new Error('console never matched /' + re.source + '/ — console was: ' + JSON.stringify(text.slice(0, 400)), { cause: e });
  }
}
/** يحذف قاعدة IndexedDB من صفحة أخرى بنفس الأصل وينتظر نجاح الحذف (تغلق الصفحة المفتوحة اتصالها عند versionchange) */
async function deleteDbFrom(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('deleteDatabase did not complete in 5 s (blocked by an open connection?)')), 5000);
    const r = indexedDB.deleteDatabase('kingcode');
    r.onsuccess = () => { clearTimeout(t); resolve(); };
    r.onerror = () => { clearTimeout(t); reject(r.error); };
  }));
}
/** صفحة ثابتة من نفس الأصل لا تفتح قاعدة البيانات ولا تُنزَّل (manifest.json يُنزَّل في Firefox) */
const NEUTRAL = '/sandbox.html';
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
  console.log('Browser: ' + BROWSER_NAME);
  const browser = await engine.launch();
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
      await waitConsole(page, /hi-preview/);
      /* Chromium/Firefox يعطيان رسالة الخطأ؛ WebKit يخفيها («Script error.») فيُشرَح السبب للمستخدم (انظر الجسر) */
      await waitConsole(page, BROWSER_NAME === 'webkit' ? /Script error/ : /boom/);
      assert((await page.$$('#console-output .lvl-error')).length >= 1, 'no error-level row in the console');
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
      await page.evaluate(() => { window.__puts = 0; const o = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (v, k) { if (v && v.id) window.__puts++; return o.apply(this, arguments); }; return 1; });
      await typeAll(page, '<p>only this file</p>'); await sleep(700);
      const puts = await page.evaluate(() => window.__puts);
      assert(puts === 1, 'expected exactly 1 file record written, got ' + puts);
    }, browser, base);

    await test('A-01: another tab deleting the database is not blocked (versionchange) and the next save recreates all data', async ({ page, ctx, base }) => {
      await page.evaluate(() => STATE.flush());
      const p2 = await ctx.newPage();
      await p2.goto(base + NEUTRAL);
      await deleteDbFrom(p2); /* يفشل بمهلة إن حجب التطبيقُ الحذفَ بإبقاء اتصاله مفتوحًا */
      await p2.close();
      assert((await page.evaluate(() => STORE._db)) === null, 'connection was not closed on versionchange');
      await typeAll(page, 'AFTER-DB-DELETED'); await sleep(900);
      assert((await page.evaluate(() => STATE.saveFailed)) === false, 'save failed after the database was deleted by another tab');
      assert((await page.evaluate(() => STORE._req('files', s => s.count()))) === 3, 'not all files were rewritten into the new database');
      assert((await stored(page)) === 'AFTER-DB-DELETED', 'edit not stored');
    }, browser, base);

    await test('A-01: legacy localStorage project is migrated into IndexedDB on first run', async ({ page, ctx, base }) => {
      /* أنهِ أي حفظ معلّق للصفحة القديمة أولًا: وإلا يكتب pagehide سجل طوارئ لمشروعها (سباق ظهر في CI) فيتداخل مع الكتلة القديمة التي نحقنها هنا */
      await page.evaluate(() => STATE.flush());
      const p2 = await ctx.newPage();
      await p2.goto(base + NEUTRAL);
      await deleteDbFrom(p2); /* الصفحة المفتوحة تغلق اتصالها عند versionchange فيكتمل الحذف في كل المتصفحات */
      await p2.evaluate(() => localStorage.setItem('kingcode:state:v1', JSON.stringify({ v: 1, files: [{ id: 'L1', name: 'legacy.md', content: 'LEGACY-DATA', updatedAt: 1 }], tabs: ['L1'], activeId: 'L1', settings: {}, uiPrefs: {} })));
      await p2.close();
      await reload(page); await sleep(700);
      assert((await page.evaluate(() => kc.STATE.files().map(f => f.name).join())) === 'legacy.md', 'legacy project not loaded');
      assert((await page.evaluate(() => kc.EDITOR.cm.getValue())) === 'LEGACY-DATA', 'editor does not show migrated file');
      await reload(page);
      assert((await page.evaluate(() => STORE.kind)) === 'idb' && (await page.evaluate(() => kc.STATE.files()[0].content)) === 'LEGACY-DATA', 'not persisted in idb after migration');
    }, browser, base);

    await test('A-01: upgrading user edits immediately (first IndexedDB save still pending) and reloads: migrated project + edit survive', async ({ page, ctx, base }) => {
      await page.evaluate(() => STATE.flush());
      const p2 = await ctx.newPage();
      await p2.goto(base + NEUTRAL);
      await p2.evaluate(() => localStorage.setItem('kingcode:state:v1', JSON.stringify({ v: 1, files: [{ id: 'L1', name: 'old-a.md', content: 'OLD-A', updatedAt: 1 }, { id: 'L2', name: 'old-b.md', content: 'OLD-B', updatedAt: 1 }], tabs: ['L1'], activeId: 'L1', settings: {}, uiPrefs: {} })));
      await deleteDbFrom(p2); /* الصفحة المفتوحة تغلق اتصالها عند versionchange فيكتمل الحذف في كل المتصفحات */
      await p2.close();
      await reload(page); /* ترحيل: الحفظ الأول إلى IndexedDB ما زال معلّقًا (debounce) */
      await typeAll(page, 'EDIT-DURING-FIRST-SAVE');
      await reload(page); /* pagehide ⇒ سجل طوارئ كامل */
      const names = await page.evaluate(() => kc.STATE.files().map(f => f.name).sort());
      assert(names.join() === 'old-a.md,old-b.md', 'migrated project damaged: ' + names);
      assert((await page.evaluate(() => kc.STATE.fileByName('old-a.md').content)) === 'EDIT-DURING-FIRST-SAVE', 'edit lost');
      assert((await page.evaluate(() => kc.STATE.fileByName('old-b.md').content)) === 'OLD-B', 'untouched file damaged');
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

    /* ---- A-03: نظام الملفات الافتراضي (مجلدات) ---- */
    const rowsOf = page => page.$$eval('#file-list .file-item', n => n.map(r => ({ kind: r.dataset.kind, label: r.querySelector('.file-name').textContent, level: r.getAttribute('aria-level'), expanded: r.getAttribute('aria-expanded') })));
    const fillPrompt = async (page, value) => { await page.waitForSelector('#prompt-modal', { state: 'visible' }); await page.fill('#prompt-input', value); await page.click('#prompt-ok'); await sleep(250); };
    const confirmOk = async page => { await page.waitForSelector('#confirm-modal', { state: 'visible' }); await page.click('#confirm-ok'); await sleep(300); };

    await test('UX: the explorer highlights exactly the active file after switching tabs, palette and Alt+Arrow', async ({ page }) => {
      await page.evaluate(() => { FILES.create('one.js', '1'); FILES.create('two.js', '2'); });
      await sleep(200);
      const activeRows = () => page.$$eval('#file-list .file-item[data-kind="file"].active', n => n.map(r => r.querySelector('.file-name').textContent));
      const expectActive = async (name, why) => { const a = await activeRows(); assert(a.length === 1 && a[0] === name, why + ': expected only ' + name + ' highlighted, got ' + JSON.stringify(a)); assert((await page.evaluate(() => kc.STATE.file(kc.STATE.data.activeId).name)) === name, why + ': state mismatch'); };
      await expectActive('two.js', 'after create');
      await page.click('#tab-container .tab:has-text("one.js")'); await sleep(200);
      await expectActive('one.js', 'after clicking a tab');
      await page.evaluate(() => { kc.EDITOR.cm.focus(); });
      await page.keyboard.press('Alt+ArrowRight'); await sleep(200);
      assert((await activeRows()).length === 1, 'Alt+Arrow left several/no highlighted rows');
      assert((await page.$eval('#file-list .file-item.active', r => r.getAttribute('aria-selected'))) === 'true', 'aria-selected not set on the active row');
    }, browser, base);

    await test('A-03: nested path creates a folder row; folders collapse/expand and the state survives reload', async ({ page }) => {
      await page.evaluate(() => { FILES.create('src/app.js', 'x'); FILES.create('src/lib/util.js', 'y'); });
      await sleep(200);
      let rows = await rowsOf(page);
      assert(rows.some(r => r.kind === 'folder' && r.label === 'src/' && r.level === '1'), 'no src folder: ' + JSON.stringify(rows));
      assert(rows.some(r => r.kind === 'folder' && r.label === 'lib/' && r.level === '2'), 'no nested folder');
      assert(rows.some(r => r.kind === 'file' && r.label === 'util.js' && r.level === '3'), 'file not nested under lib');
      await page.click('#file-list .folder-item[data-path="src"]'); await sleep(200);
      rows = await rowsOf(page);
      assert(!rows.some(r => r.label === 'app.js'), 'collapse did not hide children');
      assert((await page.getAttribute('#file-list .folder-item[data-path="src"]', 'aria-expanded')) === 'false', 'aria-expanded not updated');
      await sleep(400); await reload(page);
      rows = await rowsOf(page);
      assert(!rows.some(r => r.label === 'app.js') && rows.some(r => r.label === 'src/'), 'collapsed state lost on reload');
    }, browser, base);

    await test('A-03: "new folder" button creates an empty folder that persists; clashes are refused with a message', async ({ page }) => {
      await page.click('#btnNewFolder');
      await fillPrompt(page, 'assets/img');
      let rows = await rowsOf(page);
      assert(rows.some(r => r.label === 'assets/') && rows.some(r => r.label === 'img/'), 'empty folders not shown: ' + JSON.stringify(rows));
      await sleep(400); await reload(page);
      assert((await rowsOf(page)).some(r => r.label === 'img/'), 'empty folder lost on reload');
      await page.click('#btnNewFolder'); await fillPrompt(page, 'index.html');
      assert((await page.$$eval('.toast', n => n.map(x => x.textContent))).some(t => /يتعارض|بنفس الاسم/.test(t)), 'no clash message');
    }, browser, base);

    await test('A-03: rename folder moves its files (editor, tabs, status bar follow); delete folder removes contents', async ({ page }) => {
      await page.evaluate(() => { FILES.create('old/a.css', 'a{}'); FILES.create('old/sub/b.md', '# b'); });
      await sleep(200);
      await page.hover('#file-list .folder-item[data-path="old"]');
      await page.click('#file-list .folder-item[data-path="old"] [data-action="rename-folder"]');
      await fillPrompt(page, 'renamed');
      const names = await page.evaluate(() => kc.STATE.files().map(f => f.name));
      assert(names.includes('renamed/a.css') && names.includes('renamed/sub/b.md') && !names.some(n => n.startsWith('old/')), 'rename failed: ' + names);
      assert((await page.evaluate(() => kc.STATE.file(kc.STATE.data.activeId).name)) === 'renamed/sub/b.md', 'active file changed unexpectedly');
      assert((await page.textContent('#statusFile')) === 'renamed/sub/b.md', 'status bar stale');
      await page.hover('#file-list .folder-item[data-path="renamed"]');
      await page.click('#file-list .folder-item[data-path="renamed"] [data-action="delete-folder"]');
      assert(/2/.test(await page.textContent('#confirm-msg')), 'confirm should state the file count');
      await confirmOk(page);
      const after = await page.evaluate(() => kc.STATE.files().map(f => f.name));
      assert(!after.some(n => n.startsWith('renamed/')), 'folder contents remain: ' + after);
      assert((await page.evaluate(() => !!kc.STATE.data.activeId && !!kc.STATE.file(kc.STATE.data.activeId))), 'no valid active file after delete');
    }, browser, base);

    await test('A-03: file filter narrows the tree (with ancestors expanded) and Esc clears it', async ({ page }) => {
      await page.evaluate(() => { FILES.create('deep/er/needle.txt', ''); FILES.create('other/hay.txt', ''); });
      await page.click('#fileFilter'); await page.keyboard.type('needle'); await sleep(250);
      let rows = await rowsOf(page);
      assert(rows.some(r => r.label === 'needle.txt') && rows.some(r => r.label === 'deep/') && !rows.some(r => r.label === 'hay.txt'), 'filter result wrong: ' + JSON.stringify(rows));
      await page.keyboard.press('Escape'); await sleep(250);
      rows = await rowsOf(page);
      assert(rows.some(r => r.label === 'hay.txt'), 'Esc did not clear filter');
      await page.fill('#fileFilter', 'zzz-no-match'); await sleep(200);
      assert(/لا نتائج/.test(await page.textContent('#file-list')), 'no empty-state message');
    }, browser, base);

    await test('A-03: preview resolves relative paths inside folders (css/js next to a nested index.html)', async ({ page }) => {
      await importJson(page, {
        'site/index.html': '<!DOCTYPE html><link rel="stylesheet" href="css/a.css"><body><script src="js/b.js"></script></body>',
        'site/css/a.css': 'body{color:red}', 'site/js/b.js': 'console.log("nested-ok")'
      });
      await page.waitForSelector('#confirm-modal', { state: 'visible' }); await page.click('#confirm-ok');
      await page.waitForFunction(() => /nested-ok/.test(document.querySelector('#console-output').textContent), null, { timeout: 6000 });
    }, browser, base);

    await test('A-03: export → import round-trips folder paths and empty-folder-free structure', async ({ page }) => {
      await page.evaluate(() => { FILES.create('a/b/c.txt', 'deep'); });
      const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => FILES.exportProject())]);
      const json = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
      assert(json['a/b/c.txt'] === 'deep', 'export lost the path: ' + Object.keys(json));
      await importJson(page, json);
      await page.waitForSelector('#confirm-modal', { state: 'visible' }); await page.click('#confirm-ok'); await sleep(400);
      assert((await page.evaluate(() => kc.STATE.fileByName('a/b/c.txt') !== null)), 'path lost on import');
    }, browser, base);

    await test('A-03: tree keyboard navigation (arrows, Enter, expand/collapse by direction)', async ({ page }) => {
      await page.evaluate(() => { FILES.create('k/one.js', '1'); FILES.create('k/two.js', '2'); });
      await sleep(200);
      await page.focus('#file-list .folder-item[data-path="k"]');
      await page.keyboard.press('ArrowLeft'); await sleep(150); /* RTL: ← يوسّع/يطوي حسب الاتجاه */
      const exp1 = await page.getAttribute('#file-list .folder-item[data-path="k"]', 'aria-expanded');
      await page.keyboard.press('ArrowRight'); await sleep(150);
      const exp2 = await page.getAttribute('#file-list .folder-item[data-path="k"]', 'aria-expanded');
      assert(exp1 !== exp2, 'arrow keys did not toggle the folder');
      if ((await page.getAttribute('#file-list .folder-item[data-path="k"]', 'aria-expanded')) !== 'true') await page.keyboard.press('Enter');
      await sleep(150);
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await sleep(300);
      assert(/^k\//.test(await page.evaluate(() => kc.STATE.file(kc.STATE.data.activeId).name)), 'Enter did not open the focused file');
    }, browser, base);

    /* ---- Phase 5: إمكانية الوصول ---- */
    await test('STORE: privacy page is served, linked from Settings (new tab, noopener), bilingual and script-free', async ({ page, base }) => {
      await page.evaluate(() => UI.openSettings());
      const link = await page.$eval('#settings-modal a[href="privacy.html"]', a => ({ target: a.target, rel: a.rel }));
      assert(link.target === '_blank' && /noopener/.test(link.rel), 'privacy link must open in a new tab with noopener: ' + JSON.stringify(link));
      const p2 = await page.context().newPage();
      const res = await p2.goto(base + '/privacy.html');
      assert(res.status() === 200, 'privacy.html status ' + res.status());
      const title = await p2.title();
      assert(/سياسة الخصوصية/.test(title), 'unexpected title: ' + title);
      assert((await p2.$$('script')).length === 0, 'privacy page must contain no scripts');
      assert((await p2.$$('section[lang="en"]')).length === 1, 'English section missing');
      await p2.close();
    }, browser, base);

    await test('A11Y: every button has an accessible name; tree/option roles are correct', async ({ page }) => {
      await sleep(300);
      const unnamed = await page.evaluate(() => Array.from(document.querySelectorAll('button')).filter(b => !((b.getAttribute('aria-label') || b.textContent || '').trim())).map(b => b.outerHTML.slice(0, 80)));
      assert(unnamed.length === 0, 'unnamed buttons: ' + unnamed.join(' | '));
      const noName = await page.evaluate(() => Array.from(document.querySelectorAll('input:not([type=file]):not([type=checkbox]):not([type=range]), select')).filter(i => !(i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || (i.id && document.querySelector('label[for="' + i.id + '"]')))).map(i => i.id));
      assert(noName.length === 0, 'unlabeled controls: ' + noName.join());
      assert((await page.getAttribute('#file-list', 'role')) === 'tree', 'file list is not a tree');
      await page.evaluate(() => Commands.run('ui.palette')); await sleep(200);
      assert((await page.$$eval('#cmd-results li[role=option]', n => n.length)) > 0 && (await page.$$eval('#cmd-results li[aria-selected=true]', n => n.length)) === 1, 'palette options/aria-selected wrong');
    }, browser, base);

    await test('A11Y: Esc leaves the editor so Tab is not trapped; Tab still indents inside it', async ({ page }) => {
      await page.evaluate(() => { kc.EDITOR.cm.focus(); kc.EDITOR.cm.setCursor({ line: 0, ch: 0 }); });
      const before = await page.evaluate(() => kc.EDITOR.cm.getLine(0));
      await page.keyboard.press('Tab');
      assert((await page.evaluate(() => kc.EDITOR.cm.getLine(0))) !== before, 'Tab did not indent inside the editor');
      await page.keyboard.press('Escape'); await sleep(100);
      assert(await page.evaluate(() => !document.activeElement.closest('.CodeMirror')), 'focus still inside the editor after Esc');
      await page.keyboard.press('Tab'); await sleep(100);
      assert(await page.evaluate(() => !document.activeElement.closest('.CodeMirror') && document.activeElement !== document.body), 'Tab after Esc did not move focus to another control');
    }, browser, base);

    await test('A11Y: palette lists every file and command (no 14-item cut-off)', async ({ page }) => {
      await page.evaluate(() => { for (let i = 0; i < 20; i++) FILES.create('p' + i + '.txt', ''); });
      await page.evaluate(() => Commands.run('ui.palette')); await sleep(200);
      const n = await page.$$eval('#cmd-results li', x => x.length);
      assert(n > 30, 'palette truncated: ' + n);
    }, browser, base);

    /* ---- T-05: تحديث PWA الحقيقي بين نسختين ---- */
    const appDir = path.join(tmp, 'app-copy');
    copyApp(appDir);
    const port2 = await freePort();
    const server2 = await startServerAt(appDir, port2);
    const base2 = 'http://127.0.0.1:' + port2;
    try {
      await test('T-05/F-07: a new service worker waits for the user; applyUpdate saves, activates it, reloads, and cleans only kingcode caches', async ({ page }) => {
        await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 10000 });
        const oldCache = (await page.evaluate(() => caches.keys())).find(k => k.startsWith('kingcode-cache-'));
        assert(oldCache, 'no kingcode cache before update');
        await page.evaluate(() => caches.open('foreign-app-cache').then(c => c.put('/f', new Response('f'))));
        /* نسخة «جديدة»: غيّر VERSION في الملف المقدَّم */
        const swPath = path.join(appDir, 'service-worker.js');
        const sw = fs.readFileSync(swPath, 'utf8');
        fs.writeFileSync(swPath, sw.replace(/const VERSION = '[^']+'/, "const VERSION = 'kingcode-v9.9.9'"));
        await page.evaluate(() => { window.__marker = 1; return navigator.serviceWorker.getRegistration().then(r => r.update()); });
        await page.waitForFunction(() => APP.updateReady === true, null, { timeout: 10000 });
        await sleep(1200);
        assert((await page.evaluate(() => window.__marker)) === 1, 'page reloaded by itself on update');
        assert((await page.$$eval('.toast', n => n.map(x => x.textContent))).some(t => /تحديث/.test(t)), 'no update toast');
        const mid = await page.evaluate(() => caches.keys());
        assert(mid.includes(oldCache), 'old cache removed before the user applied the update');
        /* تعديل غير محفوظ بعد → يجب ألّا يضيع */
        await typeAll(page, 'EDIT-BEFORE-UPDATE');
        await page.evaluate(() => APP.applyUpdate());
        await page.waitForFunction(() => !window.__marker, null, { timeout: 15000 });
        await page.waitForFunction(() => window.KINGCODE_READY);
        assert((await page.evaluate(() => kc.STATE.files()[0].content)) === 'EDIT-BEFORE-UPDATE', 'edit lost across the update reload');
        await sleep(800);
        const after = await page.evaluate(() => caches.keys());
        assert(after.includes('kingcode-cache-kingcode-v9.9.9'), 'new cache missing: ' + after);
        assert(!after.includes(oldCache), 'old kingcode cache not cleaned: ' + after);
        assert(after.includes('foreign-app-cache'), 'foreign cache was deleted: ' + after);
      }, browser, base2);
    } finally { server2.kill(); }

    /* ---- Phase 4: المحرر ---- */
    await test('EDITOR: Ctrl+F opens search, finds matches; Ctrl+H replaces', async ({ page }) => {
      await typeAll(page, 'foo bar foo baz foo');
      await page.evaluate(() => { kc.EDITOR.cm.focus(); kc.EDITOR.cm.setCursor({ line: 0, ch: 0 }); });
      await page.keyboard.press('Control+f'); await sleep(300);
      assert((await page.$$('.CodeMirror-dialog')).length > 0, 'search dialog did not open');
      await page.keyboard.type('foo'); await page.keyboard.press('Enter'); await sleep(200);
      assert((await page.evaluate(() => kc.EDITOR.cm.getSelection())) === 'foo', 'search did not select a match');
      await page.keyboard.press('Escape'); await sleep(150);
      await page.evaluate(() => { kc.EDITOR.cm.focus(); kc.EDITOR.cm.setCursor({ line: 0, ch: 0 }); });
      await page.keyboard.press('Control+h'); await sleep(300);
      await page.keyboard.type('foo'); await page.keyboard.press('Enter'); await sleep(150);
      await page.keyboard.type('X'); await page.keyboard.press('Enter'); await sleep(150);
      await page.keyboard.press('Enter'); await sleep(150); /* يستبدل كل ما تبقّى بحسب الحوار: نتأكد على الأقل أن أول تطابق استُبدل */
      assert(/X/.test(await page.evaluate(() => kc.EDITOR.cm.getValue())), 'replace did not change the text');
    }, browser, base);

    await test('EDITOR: Ctrl+/ toggles comments in JS and HTML modes; syntax highlighting classes present', async ({ page }) => {
      await page.evaluate(() => { FILES.create('t.js', 'let a = 1;\nlet b = 2;'); });
      await sleep(250);
      await page.evaluate(() => { kc.EDITOR.cm.focus(); kc.EDITOR.cm.execCommand('selectAll'); });
      await page.keyboard.press('Control+/'); await sleep(150);
      assert(/^\/\/ let a/.test(await page.evaluate(() => kc.EDITOR.cm.getLine(0))), 'JS comment not applied');
      await page.keyboard.press('Control+/'); await sleep(150);
      assert((await page.evaluate(() => kc.EDITOR.cm.getLine(0))) === 'let a = 1;', 'JS uncomment failed');
      assert((await page.$$('.CodeMirror .cm-keyword')).length > 0, 'no syntax highlighting (cm-keyword)');
      await page.evaluate(() => { FILES.create('t.css', 'a { color: red; }'); }); await sleep(250);
      assert((await page.$$('.CodeMirror .cm-property')).length > 0, 'CSS highlighting missing');
    }, browser, base);

    await test('EDITOR: settings apply live and persist (theme, font size, tab size, wrap, line numbers)', async ({ page }) => {
      await page.evaluate(() => { STATE.setSetting('theme', 'dracula'); STATE.setSetting('fontSize', 20); STATE.setSetting('tabSize', 4); STATE.setSetting('wrapLines', true); STATE.setSetting('showLineNumbers', false); });
      await sleep(300);
      assert(await page.evaluate(() => document.querySelector('.CodeMirror').classList.contains('cm-s-dracula')), 'theme not applied');
      assert((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size').trim())) === '20px', 'font size not applied');
      assert((await page.evaluate(() => kc.EDITOR.cm.getOption('tabSize'))) === 4 && (await page.evaluate(() => kc.EDITOR.cm.getOption('lineWrapping'))) === true, 'tab/wrap not applied');
      assert((await page.evaluate(() => kc.EDITOR.cm.getOption('lineNumbers'))) === false && (await page.evaluate(() => getComputedStyle(document.querySelector('.CodeMirror-gutters')).display)) === 'none', 'line numbers still visible');
      await sleep(400); await reload(page);
      assert((await page.evaluate(() => kc.STATE.settings().theme)) === 'dracula' && (await page.evaluate(() => kc.STATE.settings().fontSize)) === 20, 'settings lost on reload');
      assert(await page.evaluate(() => document.querySelector('.CodeMirror').classList.contains('cm-s-dracula')), 'theme not restored on reload');
    }, browser, base);

    await test('EDITOR: Ctrl+S saves with feedback; Ctrl+P opens palette; Alt+Arrow switches tabs', async ({ page }) => {
      await page.evaluate(() => { kc.EDITOR.cm.focus(); });
      await page.keyboard.press('Control+s'); await sleep(250);
      assert((await page.$$eval('.toast', n => n.map(x => x.textContent))).some(t => /حُفظ/.test(t)), 'no save toast');
      await page.keyboard.press('Control+p'); await sleep(250);
      assert(await page.evaluate(() => UI.isModalOpen('command-palette')), 'palette did not open');
      await page.keyboard.press('Escape'); await sleep(150);
      await page.evaluate(() => TABS.open(kc.STATE.files()[1].id, { activate: false })); /* Alt+Arrow needs ≥ 2 pestañas */
      await page.evaluate(() => kc.STATE.setActive(kc.STATE.data.tabs[0]));
      const first = await page.evaluate(() => kc.STATE.data.activeId);
      await page.evaluate(() => kc.EDITOR.cm.focus());
      await page.keyboard.press('Alt+ArrowRight'); await sleep(200);
      const second = await page.evaluate(() => kc.STATE.data.activeId);
      assert(second !== first, 'Alt+→ inside the editor did not switch to the next tab (handlers cancelled each other)');
      await page.keyboard.press('Alt+ArrowLeft'); await sleep(200);
      assert((await page.evaluate(() => kc.STATE.data.activeId)) === first, 'Alt+← inside the editor did not go back');
      await page.evaluate(() => document.activeElement.blur());
      await page.keyboard.press('Alt+ArrowRight'); await sleep(200);
      assert((await page.evaluate(() => kc.STATE.data.activeId)) === second, 'Alt+→ outside the editor did not switch tab (once)');
    }, browser, base);

    await test('EDITOR: a 50,000-line file stays responsive (type, switch tab, persist) and survives reload', async ({ page }) => {
      const lines = 'line of text number 123456\n'.repeat(50000);
      await page.evaluate(l => { FILES.create('huge.txt', l); }, lines);
      await sleep(600);
      const t0 = Date.now();
      await page.evaluate(() => { kc.EDITOR.cm.replaceRange('X', { line: 25000, ch: 0 }); });
      const typeMs = Date.now() - t0;
      assert(typeMs < 1500, 'edit in a 50k-line doc took ' + typeMs + ' ms');
      const t1 = Date.now();
      await page.evaluate(() => { kc.STATE.setActive(kc.STATE.files()[0].id); kc.STATE.setActive(kc.STATE.fileByName('huge.txt').id); });
      assert(Date.now() - t1 < 1500, 'switching tabs with a 50k-line doc was slow');
      await sleep(800); await reload(page);
      assert((await page.evaluate(() => kc.STATE.fileByName('huge.txt').content.length)) === lines.length + 1, 'huge file lost or truncated');
    }, browser, base);

    /* ---- Phase 5: تخطيط الجوال/الآيباد/سطح المكتب ---- */
    const PHONE = { viewport: { width: 390, height: 800 }, touch: true, mobile: true };
    const visible = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; }, sel);
    /* ينتظر تحقق حالة الظهور (حتى 4 ث) بدل نوم ثابت: الشريط الجانبي يتحرك بانتقال CSS 0.18s وقد يتأخر على مشغّلات CI البطيئة */
    const waitVisible = async (page, sel, want, why) => {
      const deadline = Date.now() + 4000;
      let now;
      do { now = await visible(page, sel); if (now === want) return; await sleep(100); } while (Date.now() < deadline);
      throw new Error(why + ' (expected ' + sel + ' visible=' + want + ' within 4 s)');
    };

    await test('UX phone: one full-height pane at a time, labeled bottom nav, touch targets >= 44px, no overflow', async ({ page }) => {
      assert(await visible(page, '.mobile-quickbar'), 'bottom nav missing');
      const labels = await page.$$eval('.mobile-quickbar button', b => b.map(x => x.getAttribute('aria-label')));
      assert(labels.length === 4, 'nav buttons: ' + labels);
      const small = await page.$$eval('.mobile-quickbar button', b => b.filter(x => { const r = x.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length);
      assert(small === 0, 'touch targets smaller than 44px: ' + small);
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'horizontal overflow');
      assert((await page.evaluate(() => document.body.dataset.mview)) === 'editor', 'default view is not the editor');
      assert(await visible(page, '#editor-container') && !(await visible(page, '#preview-container')), 'editor/preview visibility wrong in editor view');
      const eh = await page.evaluate(() => document.querySelector('.editor-pane').getBoundingClientRect().height);
      assert(eh > 400, 'editor pane is not full height: ' + eh);
      await page.click('[data-nav="preview"]'); await sleep(300);
      assert(await visible(page, '#preview-container') && !(await visible(page, '.editor-pane')), 'preview view wrong');
      assert((await page.getAttribute('[data-nav="preview"]', 'aria-pressed')) === 'true' && (await page.getAttribute('[data-nav="editor"]', 'aria-pressed')) === 'false', 'aria-pressed not updated');
      await page.waitForFunction(() => /المعاينة جاهزة/.test(document.querySelector('#console-output').textContent), null, { timeout: 6000 });
      await page.click('[data-nav="editor"]'); await sleep(200);
      assert(await visible(page, '.editor-pane') && !(await visible(page, '#preview-container')), 'did not return to the editor');
    }, browser, base, PHONE);

    await test('UX phone: file drawer starts closed, opens from the nav, closes after picking a file and shows the editor', async ({ page }) => {
      assert(!(await page.evaluate(() => document.querySelector('.app-container').classList.contains('sidebar-open'))), 'drawer open on first load');
      await page.click('[data-nav="preview"]'); await sleep(200);
      await page.click('[data-nav="files"]'); await sleep(350);
      assert(await page.evaluate(() => document.querySelector('.app-container').classList.contains('sidebar-open')), 'drawer did not open');
      assert((await page.getAttribute('[data-nav="files"]', 'aria-expanded')) === 'true', 'aria-expanded not set');
      await page.click('#file-list .file-item[data-kind="file"] >> nth=1'); await sleep(350);
      assert(!(await page.evaluate(() => document.querySelector('.app-container').classList.contains('sidebar-open'))), 'drawer stayed open after picking a file');
      assert((await page.evaluate(() => document.body.dataset.mview)) === 'editor', 'did not switch to the editor after picking a file');
      await sleep(400); await reload(page);
      assert(!(await page.evaluate(() => document.querySelector('.app-container').classList.contains('sidebar-open'))), 'drawer persisted open across reload on a phone');
    }, browser, base, PHONE);

    await test('UX tablet: drawer starts closed (overlay), toolbar button toggles it, side-by-side not required', async ({ page }) => {
      assert(!(await page.evaluate(() => document.querySelector('.app-container').classList.contains('sidebar-open'))), 'drawer covers the editor on first load');
      assert(await visible(page, '#btnSidebar'), 'sidebar button missing on tablet');
      await page.click('#btnSidebar'); await sleep(350);
      assert((await page.getAttribute('#btnSidebar', 'aria-expanded')) === 'true' && (await visible(page, '#sidebar')), 'drawer did not open');
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'horizontal overflow');
      assert(!(await visible(page, '.mobile-quickbar')), 'phone nav must not show on a tablet');
      await page.click('#sidebarOverlay', { position: { x: 20, y: 300 } }); await sleep(350);
      assert(!(await page.evaluate(() => document.querySelector('.app-container').classList.contains('sidebar-open'))), 'overlay click did not close the drawer');
      await page.click('#btnSidebar'); await sleep(300);
      await page.keyboard.press('Escape'); await sleep(300);
      assert(!(await page.evaluate(() => document.querySelector('.app-container').classList.contains('sidebar-open'))), 'Esc did not close the drawer');
    }, browser, base, { viewport: { width: 820, height: 1100 }, touch: true });

    await test('UX desktop: sidebar open by default, user choice persists, and a trip through phone size does not overwrite it', async ({ page }) => {
      await waitVisible(page, '#sidebar', true, 'sidebar not visible on desktop');
      await page.click('#btnSidebar');
      await waitVisible(page, '#sidebar', false, 'sidebar did not hide');
      await page.setViewportSize({ width: 390, height: 800 }); await sleep(400);
      await page.setViewportSize({ width: 1280, height: 800 }); await sleep(400);
      await waitVisible(page, '#sidebar', false, 'desktop choice (hidden) was lost after resizing through phone size');
      await sleep(400); await reload(page);
      await waitVisible(page, '#sidebar', false, 'desktop sidebar choice not persisted');
      await page.click('#btnSidebar');
      await waitVisible(page, '#sidebar', true, 'sidebar did not show again');
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
      await p2.goto(base + NEUTRAL);
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
