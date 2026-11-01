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
  '.json': 'application/manifest+json', /* PWA manifest */
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
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';

  /* منع عبور الجذر */
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
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
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
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
