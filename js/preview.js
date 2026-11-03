/* =========================================================
 * kingCode — preview.js
 * المعاينة الحية داخل iframe sandbox آمن
 * (بنية المشروع: HTML + CSS/JS مضمّنة + كونسول إلكتروني)
 * ========================================================= */
'use strict';

const PREVIEW = {

  frame: null,
  _timer: null,
  _ready: false,

  init() {
    this.frame = U.$('#preview-frame');
    window.addEventListener('message', e => {
      const d = e.data;
      if (!d || d.__kingcode !== true) return;
      /* التحقق من دورة الرسالة: يجب أن تأتي من إطار المعاينة نفسه فقط */
      if (this.frame && e.source !== this.frame.contentWindow) return;
      if (d.type === 'console') UI.consoleAppend(d.level, d.parts);
      else if (d.type === 'ready') { /* تعطل التعبئة هنا */ }
    });

    STATE.on('file:content', () => this.schedule());
    STATE.on('files:change', () => this.schedule(true));
    STATE.on('settings:autoPreview', on => on ? this.schedule(true) : null);
    STATE.on('active:change', () => { /* لا نعيد التشغيل مع التبديل */ });
  },

  /** برمجة تحديث مؤجّل — dev بلا اعتصاع */
  schedule(now = false) {
    if (!STATE.settings().autoPreview && !now) return;
    if (this._timer) this._timer.cancel();
    this._timer = U.debounce(() => this.refresh(), now ? 60 : KC.timing.preview);
    this._timer();
  },

  refresh() {
    if (!this.frame) return;
    /* حالة الترحيب: مرئية حين لا توجد ملفات، وتُخفى فور وجود أي محتوى */
    const files = STATE.files();
    const wel = document.getElementById('previewWelcome');
    if (wel) wel.classList.toggle('hidden', files.length > 0);
    if (!files.length) { this.frame.srcdoc = ''; return; }
    try {
      this.frame.srcdoc = this.buildDocument();
      UI.consoleAppend('system', '⟳ تحديث المعاينة');
    } catch (e) {
      console.error('[kingCode] preview error:', e);
    }
  },

  build() { this.refresh(); },

  /* =========================================================
   * بناء المستند: اختيار مصدر HTML، حقن CSS/JS، طيّ الكونسول
   * ========================================================= */

  /** opts.bridge=false: بلا جسر الكونسول (للتصدير المستقل) */
  buildDocument(opts = {}) {
    const files = STATE.files();
    if (!files.length) {
      return `<!doctype html><meta charset="utf-8">
      <body style="font-family:system-ui;background:#0b1522;color:#7e93a8;display:grid;place-items:center;height:100vh;direction:rtl">
      <div style="text-align:center">لا توجد ملفات 📭<br><small>أنشئ ملفًا من الشريط الجانبي</small></div></body>`;
    }

    /* إن تم إصدار الملف الحالي HTML، تُبنى المعاينة من إحتماله */
    const active = STATE.file(STATE.data.activeId);
    if (active && KC.extOf(active.name) === 'html') {
      return this.inject(active.content, files, opts);
    }

    /* لا حلاً أفضل: استخدم أول ملف index.html إن وُجد */
    for (const f of files) {
      if (f.name.toLowerCase() === 'index.html' || KC.extOf(f.name) === 'html') {
        return this.inject(f.content, files, opts);
      }
    }

    /* لا html: غلاف مجردة لعرض CSS/JS/MD النشط */
    return this.fallbackDocument(active || files[0]);
  },

  fallbackDocument(f) {
    const ext = KC.extOf(f.name);
    const esc = U.escapeHtml(f.content || '');
    const lang = KC.langFor(f.name);
    const mode = lang.mode === 'null' ? 'text/plain' : lang.mode;
    let body = '';

    if (ext === 'css') {
      body = `<style>${f.content}</style>
      <div class="kc-demo"><h1>معاينة نمط CSS لك</h1><p>عدّل الملف وشاهد النتيجة فورًا.</p>
      <button class="kc-btn">زر تجريبي</button></div>
      <style>.kc-demo{font-family:system-ui;padding:40px;display:grid;place-items:center;text-align:center;gap:12px}
      .kc-btn{padding:10px 24px;border:0;border-radius:10px;cursor:pointer}</style>`;
    } else if (ext === 'js' || ext === 'mjs' || ext === 'json') {
      body = (ext === 'json'
        ? `<pre>${esc.replace(/\n/g, '<br>')}</pre>` : `${f.content}
<script>document.body.insertAdjacentHTML("beforeend","<p style=\\"font:14px system-ui;padding:16px\\">انظر الكونسول للنتائج ⤵</p>");<\/script>`);
    } else if (ext === 'md' || ext === 'txt' || ext === 'py' || ext === 'sql' || ext === 'yml' || ext === 'yaml') {
      body = `<pre style="white-space:pre-wrap;font:14px ui-monospace,monospace;padding:24px;color:#333;direction:ltr;text-align:left">${esc || '—'}</pre>`;
    } else {
      body = `<pre>${esc || '—'}</pre>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;min-height:100vh;background:#fff">${body}</body></html>`;
  },

  /** الحقن: CSS/JS بالاسم وكلمة الوورد ذات إصدار معتمد */
  inject(content, files, opts = {}) {
    const byName = new Map();
    files.forEach(f => byName.set(f.name.toLowerCase(), f));

    const mapFor = (href) => {
      if (!href) return null;
      let k = href.split(/[?#]/)[0].trim().toLowerCase();
      k = k.replace(/^\.?\//, '');
      if (/^https?:\/\//i.test(k) || byName.has(k)) {
        /* البيانالات external غير مسنودة (أوفلاين) */
        if (byName.has(k)) return byName.get(k);
        return null;
      }
      /* جرّب اسم الملف المجرد */
      const base = k.split('/').pop();
      return byName.get(base) || null;
    };

    /* 1) حقن الكونسول أولاً */
    let out = opts.bridge === false ? content : this.injectConsoleBridge(content);

    /* 2) CSS links */
    out = out.replace(/<link\b[^>]*>/gi, tag => {
      if (!/rel=["']stylesheet["']/i.test(tag)) return tag;
      const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
      const f = mapFor(href);
      return f
        ? '<style data-kc-src="' + U.escapeHtml(f.name) + '">\n' + f.content.replace(/<\/style/gi, '<\\/style') + '\n</style>'
        : tag;
    });

    /* 3) JS scripts */
    out = out.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (whole, src) => {
      const f = mapFor(src);
      if (!f) return whole;
      return '<script data-kc-src="' + U.escapeHtml(f.name) + '">\n' + f.content.replace(/<\/script/gi, '<\\/script') + '\n<\/script>';
    });

    /* 4) مضمنات style/script التي وصل بدون ملف داخلها تنكتب كما هي */
    return out;
  },

  /* الجسر: برمجيات إلكترونية داخل الساندبوكس */
  injectConsoleBridge(content) {
    const bridge = `<script>
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
    return bridge + content;
  }
};
