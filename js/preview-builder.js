/* =========================================================
 * kingCode — preview-builder.js
 * بناء مستند المعاينة/التصدير: دالة نقية بلا DOM ولا حالة عامة (قابلة للاختبار في Node).
 * المدخلات: ملفات المشروع + id الملف النشط + خيارات. المخرجات: نص HTML.
 * تعتمد فقط على KC (امتدادات/لغات) وU.escapeHtml.
 * ========================================================= */
'use strict';

const PreviewBuilder = {

  /** opts.bridge=false: بلا جسر الكونسول (للتصدير المستقل) */
  build(files, activeId, opts = {}) {
    if (!files.length) {
      return `<!doctype html><meta charset="utf-8">
      <body style="font-family:system-ui;background:#0b1522;color:#7e93a8;display:grid;place-items:center;height:100vh;direction:rtl">
      <div style="text-align:center">لا توجد ملفات 📭<br><small>أنشئ ملفًا من الشريط الجانبي</small></div></body>`;
    }

    /* الملف النشط إن كان HTML، وإلا أول HTML في المشروع (index.html أولًا) */
    const active = files.find(f => f.id === activeId) || null;
    if (active && KC.extOf(active.name) === 'html') return this.inject(active.content, files, Object.assign({}, opts, { baseDir: U.dirName(active.name) }));

    const index = files.find(f => f.name.toLowerCase() === 'index.html') ||
      files.find(f => KC.extOf(f.name) === 'html');
    if (index) return this.inject(index.content, files, Object.assign({}, opts, { baseDir: U.dirName(index.name) }));

    /* لا HTML: غلاف لعرض CSS/JS/MD النشط */
    return this.fallback(active || files[0]);
  },

  fallback(f) {
    const ext = KC.extOf(f.name);
    const esc = U.escapeHtml(f.content || '');
    let body = '';

    if (ext === 'css') {
      body = `<style>${f.content.replace(/<\/style/gi, '<\\/style')}</style>
      <div class="kc-demo"><h1>معاينة نمط CSS لك</h1><p>عدّل الملف وشاهد النتيجة فورًا.</p>
      <button class="kc-btn">زر تجريبي</button></div>
      <style>.kc-demo{font-family:system-ui;padding:40px;display:grid;place-items:center;text-align:center;gap:12px}
      .kc-btn{padding:10px 24px;border:0;border-radius:10px;cursor:pointer}</style>`;
    } else if (ext === 'js' || ext === 'mjs') {
      body = `<script>${f.content.replace(/<\/script/gi, '<\\/script')}\n<\/script>
<p style="font:14px system-ui;padding:16px">انظر الكونسول للنتائج ⤵</p>`;
    } else if (ext === 'json') {
      body = `<pre>${esc}</pre>`;
    } else if (ext === 'md' || ext === 'txt' || ext === 'py' || ext === 'sql' || ext === 'yml' || ext === 'yaml') {
      body = `<pre style="white-space:pre-wrap;font:14px ui-monospace,monospace;padding:24px;color:#333;direction:ltr;text-align:left">${esc || '—'}</pre>`;
    } else {
      body = `<pre>${esc || '—'}</pre>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;min-height:100vh;background:#fff">${body}</body></html>`;
  },

  /** حقن CSS/JS المحلية المشار إليها بـ <link>/<script src> داخل المستند */
  inject(content, files, opts = {}) {
    const byName = new Map();
    files.forEach(f => byName.set(f.name.toLowerCase(), f));

    /* حل المسار النسبي لمستند HTML: ./ و ../ ومسارات تبدأ بـ «/» (جذر المشروع)؛ وإن لم يوجد يُجرَّب اسم الملف المجرد */
    const baseDir = opts.baseDir || '';
    const resolve = href => {
      if (!href) return null;
      let k = href.split(/[?#]/)[0].trim();
      if (!k || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(k)) return null; /* خارجي (http:, data:, //cdn) */
      const parts = k.startsWith('/') ? [] : (baseDir ? baseDir.split('/') : []);
      for (const seg of k.split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(seg);
      }
      return parts.join('/').toLowerCase();
    };
    const mapFor = href => {
      const key = resolve(href);
      if (!key) return null;
      if (byName.has(key)) return byName.get(key);
      const base = key.split('/').pop();
      for (const [n, f] of byName) if (n.split('/').pop() === base) return f; /* احتياط: اسم الملف المجرد */
      return null;
    };

    let out = opts.bridge === false ? content : this.bridge() + content;

    out = out.replace(/<link\b[^>]*>/gi, tag => {
      if (!/rel=["']stylesheet["']/i.test(tag)) return tag;
      const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
      const f = mapFor(href);
      return f
        ? '<style data-kc-src="' + U.escapeHtml(f.name) + '">\n' + f.content.replace(/<\/style/gi, '<\\/style') + '\n</style>'
        : tag;
    });

    out = out.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (whole, src) => {
      const f = mapFor(src);
      if (!f) return whole;
      return '<script data-kc-src="' + U.escapeHtml(f.name) + '">\n' + f.content.replace(/<\/script/gi, '<\\/script') + '\n<\/script>';
    });

    return out;
  },

  /** جسر الكونسول: يُحقن في بداية مستند المعاينة فقط (لا في التصدير) */
  bridge() {
    return `<script>
(function() {
  var fmt = function(args) {
    var parts = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (typeof a === 'string') parts.push(a);
      else if (a instanceof Error) parts.push(a.name + ': ' + a.message);
      else if (a && a.stack) parts.push(a.stack.split('\\n')[0]);
      else {
        try { parts.push(JSON.stringify(a, null, 0).slice(0, 400)); }
        catch (_) { parts.push(String(a)); }
      }
    }
    return parts;
  };
  ['log','info','warn','error','debug'].forEach(function(level) {
    var old = console[level];
    console[level] = function() {
      try { window.parent.postMessage({ __kingcode: true, type: 'console', level: level, parts: fmt(arguments) }, '*'); } catch (e) {}
      try { old.apply(console, arguments); } catch (e) {}
    };
  });
  window.onerror = function(msg, src, line, col, err) {
    try { window.parent.postMessage({ __kingcode: true, type: 'console', level: 'error',
      parts: [msg + '  @ سطر ' + line + (col ? ':' + col : '')] }, '*'); } catch (e) {}
  };
  window.addEventListener('unhandledrejection', function(ev) {
    try { window.parent.postMessage({ __kingcode: true, type: 'console', level: 'error',
      parts: ['Promise rejected: ' + String(ev.reason && ev.reason.message || ev.reason)] }, '*'); } catch (e) {}
  });
  console.log('[kingCode] المعاينة جاهزة داخل sandbox آمن');
})();
<\/script>`;
  }
};
