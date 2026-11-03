/* =========================================================
 * kingCode — preview.js
 * المعاينة الحية داخل iframe sandbox آمن
 * (بنية المشروع: HTML + CSS/JS مضمّنة + كونسول إلكتروني)
 * ========================================================= */
'use strict';

const PREVIEW = {

  frame: null,
  _timer: null,
  _nonce: null,
  _html: null,
  LEVELS: new Set(['log', 'info', 'warn', 'error', 'debug']),
  MAX_PARTS: 20,
  MAX_PART_LEN: 2000,

  init() {
    this.frame = U.$('#preview-frame');
    window.addEventListener('message', e => {
      const d = e.data;
      if (!d || d.__kingcode !== true) return;
      /* مصدر الرسالة: إطار المعاينة نفسه فقط (الأصل معتّم 'null' فلا يُعتمد على origin) */
      if (!this.frame || e.source !== this.frame.contentWindow) return;
      if (d.type === 'sandbox-ready') {
        /* مصافحة: الصفحة المعزولة جاهزة لنفس الـ nonce الحالي → أرسل المستند */
        if (d.nonce === this._nonce && this._html != null) {
          const html = this._html; this._html = null;
          /* targetOrigin '*' لازم لأن أصل الإطار معتّم؛ آمن لأن الوجهة هي contentWindow الإطار نفسه فقط */
          this.frame.contentWindow.postMessage({ __kingcode: true, type: 'render', nonce: this._nonce, html }, '*');
        }
      } else if (d.type === 'console') {
        const level = PREVIEW.LEVELS.has(d.level) ? d.level : 'log';
        const raw = Array.isArray(d.parts) ? d.parts : [d.parts];
        const parts = raw.slice(0, PREVIEW.MAX_PARTS).map(p => String(p).slice(0, PREVIEW.MAX_PART_LEN));
        UI.consoleAppend(level, parts);
      }
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
    if (!files.length) { this._render(''); return; }
    try {
      this._render(this.buildDocument());
      UI.consoleAppend('system', '⟳ تحديث المعاينة');
    } catch (e) {
      console.error('[kingCode] preview error:', e);
    }
  },

  build() { this.refresh(); },

  /** يحمّل صفحة العزل (sandbox.html) من جديد ثم يرسل لها المستند بعد المصافحة؛ كل عرض = تنقّل جديد بـ nonce جديد */
  _render(html) {
    this._nonce = U.uid();
    this._html = html;
    this.frame.src = 'sandbox.html?n=' + encodeURIComponent(this._nonce);
  },

  /* بناء المستند منقول إلى js/preview-builder.js (دالة نقية قابلة للاختبار) */
  buildDocument(opts = {}) {
    return PreviewBuilder.build(STATE.files(), STATE.data.activeId, opts);
  }
};
