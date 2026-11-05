/* =========================================================
 * kingCode — service-worker.js
 * عمل دون إنترنت: Cache-First للأصول + Network-First للمستندات
 * ========================================================= */
'use strict';

const VERSION = 'kingcode-v1.6.0';
const CACHE_PREFIX = 'kingcode-cache-';
const CACHE_NAME = CACHE_PREFIX + VERSION;

/** قائمة أصول kingCode (تُخزَّن عند التثبيت) */
const ASSETS = [
  /* الجذر والوثيقة */
  './',
  'index.html',
  'sandbox.html',
  'privacy.html',
  'manifest.json',

  /* الأيقونات */
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',

  /* الأنماط */
  'css/main.css',
  'css/components.css',

  /* وحدات kingCode */
  'js/config.js',
  'js/utils.js',
  'js/storage.js',
  'js/state.js',
  'js/editor.js',
  'js/files.js',
  'js/list.js',
  'js/tabs.js',
  'js/preview-builder.js',
  'js/preview.js',
  'js/commands.js',
  'js/palette.js',
  'js/bridge.js',
  'js/hub.js',
  'js/extensions-host.js',
  'ext-sandbox.html',
  'js/ui.js',
  'js/app.js',

  /* CodeMirror محليًا (لا CDN وقت التشغيل) */
  'vendor/codemirror/codemirror.min.css',
  'vendor/codemirror/codemirror.min.js',
  'vendor/codemirror/theme/ayu-mirage.min.css',
  'vendor/codemirror/theme/dracula.min.css',
  'vendor/codemirror/theme/material-darker.min.css',
  'vendor/codemirror/theme/monokai.min.css',
  'vendor/codemirror/theme/nord.min.css',
  'vendor/codemirror/theme/base16-dark.min.css',
  'vendor/codemirror/theme/eclipse.min.css',
  'vendor/codemirror/mode/xml/xml.min.js',
  'vendor/codemirror/mode/javascript/javascript.min.js',
  'vendor/codemirror/mode/css/css.min.js',
  'vendor/codemirror/mode/htmlmixed/htmlmixed.min.js',
  'vendor/codemirror/mode/markdown/markdown.min.js',
  'vendor/codemirror/mode/python/python.min.js',
  'vendor/codemirror/mode/sql/sql.min.js',
  'vendor/codemirror/mode/yaml/yaml.min.js',
  'vendor/codemirror/addon/dialog/dialog.min.js',
  'vendor/codemirror/addon/dialog/dialog.min.css',
  'vendor/codemirror/addon/search/searchcursor.min.js',
  'vendor/codemirror/addon/search/search.min.js',
  'vendor/codemirror/addon/search/jump-to-line.min.js',
  'vendor/codemirror/addon/comment/comment.min.js',
  'vendor/codemirror/addon/edit/closebrackets.min.js',
  'vendor/codemirror/addon/edit/closetag.min.js',
  'vendor/codemirror/addon/edit/matchbrackets.min.js',
  'vendor/codemirror/addon/selection/active-line.min.js',
  'vendor/codemirror/addon/hint/show-hint.min.js',
  'vendor/codemirror/addon/hint/show-hint.min.css',
  'vendor/codemirror/addon/hint/xml-hint.min.js',
  'vendor/codemirror/addon/hint/html-hint.min.js',
  'vendor/codemirror/addon/hint/css-hint.min.js',
  'vendor/codemirror/addon/hint/javascript-hint.min.js'
];

/* ---------- التثبيت: تهيئة الذاكرة المؤقتة ----------
   إخفاق أصلٍ واحد لا يُعطّل الأوفلاين كلها: تُخزَّن الأصول كلٌّ على حدة
   عبر allSettled بدل addAll الجماعي (فشله الكلّ)، والفائت يُسجَّل ويُتجاوز. */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(ASSETS.map(url =>
        cache.add(url).catch(err => {
          console.warn('[kingCode SW] asset not precached:', url, err && err.message);
          throw url; /* أسباب الرفض هي مسارات الأصول لعدّها أدناه */
        })
      )))
      .then(results => {
        const missed = results.filter(r => r.status === 'rejected').map(r => String(r.reason));
        if (missed.length) console.warn('[kingCode SW] precache incomplete — assets missing:', missed);
        /* بلا skipWaiting: التحديث يُفعَّل بطلب المستخدم (APP.applyUpdate) أو عند إغلاق كل النوافذ */
      })
  );
});

/* ---------- التفعيل: تنظيف نسخ kingCode القديمة فقط (لا نمسّ ذاكرات تطبيقات أخرى على نفس الأصل) ---------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- مساعدة: تحديث خلفي للأصل ---------- */
function backgroundUpdate(request, cache) {
  return fetch(request)
    .then(res => {
      if (res && res.status === 200) {
        return cache.put(request, res.clone());
      }
    })
    .catch(() => { /* الأوفلاين: نتجاهل بصمت */ });
}

/* ---------- الاعتراض على الطلبات ---------- */
self.addEventListener('fetch', event => {
  const req = event.request;

  /* GET فقط */
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  /* المستندات: شبكة أولًا (تحديثات فورية) ثم الذاكرة (دون إنترنت) */
  if (req.mode === 'navigate' || (req.destination && req.destination === 'document')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200 && url.origin === location.origin) {
            event.waitUntil(caches.open(CACHE_NAME).then(cache => {
              cache.put(req, res.clone());
            }));
          }
          return res;
        })
        .catch(() => caches.match('index.html').then(hit => hit ||
          new Response('<h1 style="font-family:sans-serif;padding:24px">لا يوجد اتصال ⚡</h1>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        ))
    );
    return;
  }

  /* الأصول الأخرى: الأخير المؤقت أولًا + تحديث خلفي */
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(req).then(cached => {
        if (cached) {
          event.waitUntil(backgroundUpdate(req, cache));
          return cached;
        }
        return fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone());
          }
          return res;
        });
      })
    )
  );
});

/* ---------- تعليمات من الصفحة ---------- */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
