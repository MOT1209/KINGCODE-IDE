/* =========================================================
 * kingCode — tools/make-screenshots.js
 * يولّد لقطات المتجر/تثبيت PWA من التطبيق الحقيقي (Chromium عبر Playwright — أداة تطوير فقط).
 *   node tools/make-screenshots.js        → screenshots/*.png  (مذكورة في manifest.json)
 * wide (1280×720) لسطح المكتب/ويندوز، narrow (540×960، نسبة 9:16) لأندرويد.
 * ========================================================= */
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

const DEMO = {
  'index.html': '<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n  <meta charset="UTF-8">\n  <title>موقعي</title>\n  <link rel="stylesheet" href="css/style.css">\n</head>\n<body>\n  <main class="card">\n    <h1>مرحباً من <span>kingCode</span> 👑</h1>\n    <p>عدّل الملفات وشاهد المعاينة تتجدد فورًا.</p>\n    <button id="btn">✨ اضغط هنا</button>\n    <p id="out"></p>\n  </main>\n  <script src="js/app.js"></script>\n</body>\n</html>\n',
  'css/style.css': 'body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #12253a, #1d3b5c); font-family: system-ui, sans-serif; color: #fff; }\n.card { text-align: center; padding: 32px 40px; border-radius: 20px; background: rgba(255,255,255,.08); }\nh1 span { color: #6cb6ff; }\nbutton { padding: 10px 22px; border: 0; border-radius: 12px; background: #4da3ff; color: #08121f; font-size: 16px; cursor: pointer; }\n',
  'js/app.js': 'const btn = document.getElementById("btn");\nlet n = 0;\nbtn.addEventListener("click", () => {\n  n++;\n  document.getElementById("out").textContent = "ضغطت " + n + " مرة";\n  console.log("clicked", n);\n});\nconsole.log("kingCode جاهز");\n',
  'README.md': '# موقعي\n\nمشروع تجريبي داخل kingCode.\n'
};

async function boot(browser, base, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.waitForFunction(() => window.KINGCODE_READY);
  await page.evaluate(files => {
    const st = window.kc.STATE;
    const list = Object.entries(files).map(([name, content]) => ({ id: 'd' + name.length + name.charCodeAt(0), name, content, updatedAt: Date.now() }));
    st.replaceProject(list);
    window.kc.EDITOR.docs.clear();
    window.kc.FILE_LIST.render(); window.kc.TABS.render();
    st.emit('active:change', st.data.activeId);
    window.kc.PREVIEW.schedule(true);
  }, DEMO);
  await sleep(2200);
  return { ctx, page };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'server.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    const ok = await new Promise(r => http.get({ host: '127.0.0.1', port, path: '/', agent: false }, res => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)));
    if (ok) break; await sleep(100);
  }
  const base = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch();
  try {
    /* wide: سطح المكتب (داكن) ثم فاتح */
    let s = await boot(browser, base, { viewport: { width: 1280, height: 720 } });
    await s.page.evaluate(() => { window.kc.TABS.open(window.kc.STATE.fileByName('js/app.js').id); });
    await sleep(900);
    await s.page.screenshot({ path: path.join(OUT, 'wide-1.png') });
    await s.page.evaluate(() => { window.kc.STATE.setSetting('uiTheme', 'light'); window.kc.TABS.open(window.kc.STATE.fileByName('index.html').id); });
    await sleep(1500);
    await s.page.screenshot({ path: path.join(OUT, 'wide-2.png') });
    await s.ctx.close();

    /* narrow: جوال 540×960 (360×640 @1.5x): المحرر ثم المعاينة */
    s = await boot(browser, base, { viewport: { width: 360, height: 640 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
    await s.page.screenshot({ path: path.join(OUT, 'narrow-1.png') });
    await s.page.click('[data-nav="preview"]');
    await sleep(1800);
    await s.page.screenshot({ path: path.join(OUT, 'narrow-2.png') });
    await s.ctx.close();
  } finally { await browser.close(); server.kill(); }
  console.log('screenshots written to ' + OUT);
})().catch(e => { console.error(e); process.exit(1); });
