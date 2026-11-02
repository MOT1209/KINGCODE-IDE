/* =========================================================
 * kingCode — tools/server.js
 * خادم ثابت بسيط بدون تبعيات، للتجربة المحلية
 * التشغيل:  node tools/server.js
 * ========================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8123;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json'
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store'
    /* CB-07: حُذف Access-Control-Allow-Origin: '*' - خادم محلي لا يحتاج فتح CORS لأي أصل،
       والفتح العام يخوّل أي صفحة ويب خارجية قراءة ملفات الجهاز عبر هذا الخادم */
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    /* CB-02: مسار مثل /% يرمي URIError ويقتل العملية؛ نقبلها بـ 400 بدلاً من الانهيار */
    send(res, 400, 'Bad Request', 'text/plain');
    return;
  }
  if (urlPath.includes('\0')) {
    /* بايت فارغ يرفضه fs مع استثناء غير مُلتقط */
    send(res, 400, 'Bad Request', 'text/plain');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';

  /* CB-04: منع عبور الجذر — نُحسم المسار أولاً ثم نقارن مع الجذر + فاصله النهائي؛
     المطابقة بلا فاصل كانت ستجيزأشقاء مثل ROOT-x عبر startsWith(ROOT) */
  const filePath = path.resolve(ROOT, '.' + urlPath);
  const ROOT_WITH_SEP = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (filePath !== ROOT && !filePath.startsWith(ROOT_WITH_SEP)) {
    send(res, 403, 'Forbidden', 'text/plain');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      /* fallback: أي 404 للمسارات غير قياسية يعرض التطبيق (SPA-safe) */
      if (!path.extname(urlPath)) {
        fs.readFile(path.join(ROOT, 'index.html'), (e, html) => {
          if (e) send(res, 404, 'Not Found', 'text/plain');
          else send(res, 200, html, MIME['.html']);
        });
        return;
      }
      send(res, 404, 'Not Found: ' + urlPath, 'text/plain');
      return;
    }
    let type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    /* CB-05: manifest.json يستحق MIME الـ manifest الصحيح بينما باقي JSON عام */
    if (path.basename(filePath).toLowerCase() === 'manifest.json') {
      type = MIME['.webmanifest'];
    }
    send(res, 200, data, type);
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ⚡ kingCode جاهز:  http://localhost:' + PORT + '/');
  console.log('  🛜 تحقق أيضاً:      http://' + HOST + ':' + PORT + '/');
  console.log('  أوقف الخادم بـ Ctrl+C');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error('⚠ المنفذ ' + PORT + ' مشغول. جرّب: PORT=8124 node tools/server.js');
  } else {
    throw err;
  }
});
