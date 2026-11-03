/* =========================================================
 * kingCode — tools/perf.js
 * قياس أداء قابل للتكرار (Chromium عبر Playwright — dev فقط). يشغّل نفس السيناريو على نسختين:
 *   node tools/perf.js [مرجع-git-للمقارنة]     مثال: node tools/perf.js 45f7284
 * المقاييس (وسيط 5 تشغيلات نظيفة لكل نسخة):
 *   startup_ms         : من بدء التنقل حتى KINGCODE_READY (سياق جديد بلا كاش)
 *   blocked_ms         : مجموع المهام الطويلة (>50ms) على الخيط الرئيسي أثناء 20 تعديلًا موزعة على مشروع 20 ملفًا × 100KB
 *   max_task_ms        : أطول مهمة طويلة منفردة
 *   bytes_per_edit     : متوسط حجم البيانات المكتوبة لكل تعديل (setItem لنسخة localStorage القديمة؛ put لسجلات IndexedDB)
 *   big_edit_ms        : زمن تعديل حرف واحد في مستند 100,000 سطر
 *   page_loads_first_visit : عدد مرات تحميل الصفحة خلال أول زيارة (القديم يعيد التحميل تلقائيًا عند تفعيل الـ service worker)
 * النتائج تتغير بحسب الجهاز: القيمة في المقارنة النسبية بين النسختين على نفس الجهاز وليس الأرقام المطلقة.
 * ========================================================= */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const RUNS = 5;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function serve(dir) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(dir, 'tools', 'server.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    const ok = await new Promise(r => http.get({ host: '127.0.0.1', port, path: '/', agent: false }, res => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)));
    if (ok) return { child, base: 'http://127.0.0.1:' + port };
    await sleep(100);
  }
  child.kill(); throw new Error('server did not start for ' + dir);
}

async function measure(browser, base) {
  const out = { startup: [], blocked: [], maxTask: [], bytes: [], bigEdit: [], loads: [] };
  for (let run = 0; run < RUNS; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    let navs = 0;
    page.on('load', () => { navs++; }); /* أحداث تحميل مستند حقيقية فقط (history.replaceState لا يُحتسب) */
    const t0 = Date.now();
    await page.goto(base + '/');
    await page.waitForFunction(() => window.KINGCODE_READY);
    out.startup.push(Date.now() - t0);
    /* انتظر استقرار الصفحة: النسخ القديمة تعيد تحميل نفسها مرة عند تفعيل الـ service worker لأول مرة */
    await sleep(3000);
    await page.waitForFunction(() => window.KINGCODE_READY && window.kc);
    out.loads.push(navs);

    /* مشروع كبير: 20 ملفًا × 100KB */
    await page.evaluate(() => {
      const st = window.kc.STATE;
      for (let i = 0; i < 20; i++) {
        const content = ('line ' + i + ' of some text content\n').repeat(4500);
        if (st.addFile) st.addFile('perf' + i + '.txt', content, { tab: false });
        else st.data.files.push({ id: 'p' + i, name: 'perf' + i + '.txt', content, updatedAt: Date.now() });
      }
      st.persist(st.ALL);
    });
    await sleep(1500);

    /* أدوات القياس: مهام طويلة + حجم الكتابة */
    await page.evaluate(() => {
      window.__tasks = []; window.__bytes = [];
      try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__tasks.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch (e) { /* غير مدعوم */ }
      const si = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { window.__bytes.push(String(v).length); return si.apply(this, arguments); };
      if (typeof IDBObjectStore !== 'undefined') {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (v) { try { window.__bytes.push(JSON.stringify(v).length); } catch (e) { /* ignore */ } return put.apply(this, arguments); };
      }
    });
    await page.evaluate(() => { window.kc.STATE.setActive(window.kc.STATE.files()[3].id); });
    await sleep(500);
    await page.evaluate(() => { window.__tasks.length = 0; window.__bytes.length = 0; });
    for (let i = 0; i < 20; i++) {
      await page.evaluate(i => { const cm = window.kc.EDITOR.cm; cm.replaceRange('x', { line: i, ch: 0 }); }, i);
      await sleep(320); /* أكثر من فترة debounce للحفظ (250ms): كل تعديل يسبب كتابة واحدة */
    }
    await sleep(600);
    const m = await page.evaluate(() => ({ tasks: window.__tasks.slice(), bytes: window.__bytes.slice() }));
    out.blocked.push(Math.round(m.tasks.reduce((a, b) => a + b, 0)));
    out.maxTask.push(Math.round(Math.max(0, ...m.tasks)));
    out.bytes.push(Math.round(m.bytes.reduce((a, b) => a + b, 0) / 20));

    /* مستند 100,000 سطر */
    await page.evaluate(() => {
      const f = window.kc.STATE.files()[0]; window.kc.STATE.setActive(f.id);
      window.kc.EDITOR.cm.replaceRange('line of text\n'.repeat(100000), { line: 0, ch: 0 });
    });
    await sleep(1500);
    const be = await page.evaluate(() => { const t = performance.now(); window.kc.EDITOR.cm.replaceRange('y', { line: 50000, ch: 0 }); return performance.now() - t; });
    out.bigEdit.push(Math.round(be));
    await ctx.close();
  }
  return {
    startup_ms: median(out.startup), blocked_ms: median(out.blocked), max_task_ms: median(out.maxTask),
    bytes_per_edit: median(out.bytes), big_edit_ms: median(out.bigEdit), page_loads_first_visit: median(out.loads), raw: out
  };
}

(async () => {
  const ref = process.argv[2];
  const browser = await chromium.launch();
  const results = {};
  const servers = [];
  try {
    if (ref) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-perf-old-'));
      const tar = execFileSync('git', ['-C', ROOT, 'archive', ref], { maxBuffer: 512 * 1024 * 1024 });
      execFileSync('tar', ['-x', '-C', dir], { input: tar });
      const s = await serve(dir); servers.push(s);
      results[ref] = await measure(browser, s.base);
    }
    const cur = await serve(ROOT); servers.push(cur);
    results.current = await measure(browser, cur.base);
  } finally {
    await browser.close(); servers.forEach(s => s.child.kill());
  }
  console.log(JSON.stringify(results, null, 2));
  console.log('\n| Metric (median of ' + RUNS + ') | ' + Object.keys(results).join(' | ') + ' |');
  console.log('|---|' + Object.keys(results).map(() => '---|').join(''));
  for (const k of ['startup_ms', 'page_loads_first_visit', 'blocked_ms', 'max_task_ms', 'bytes_per_edit', 'big_edit_ms']) {
    console.log('| ' + k + ' | ' + Object.keys(results).map(r => results[r][k]).join(' | ') + ' |');
  }
})().catch(e => { console.error(e); process.exit(1); });
