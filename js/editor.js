/* =========================================================
 * kingCode — editor.js
 * محرر CodeMirror واحد مع Docs متعددة:
 * لكل ملف (تاريخ/مؤشر/تمرير) مستقل، والتبديل بـ swapDoc.
 * ========================================================= */
'use strict';

const EDITOR = {
  cm: null,
  docs: new Map(),
  _last: null,
  _suspendEvents: false,

  init(container) {
    const st = STATE.settings();

    this.cm = CodeMirror(container, {
      value: '',
      lineNumbers: st.showLineNumbers,
      lineWrapping: st.wrapLines,
      styleActiveLine: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      indentUnit: st.tabSize,
      tabSize: st.tabSize,
      indentWithTabs: false,
      theme: st.uiTheme === 'light' ? 'eclipse' : st.theme,
      inputStyle: 'contenteditable',
      spellcheck: false,
      cursorBlinkRate: 550,
      hintOptions: { completeSingle: false },
      extraKeys: {
        'Tab': cm => cm.replaceSelection(' '.repeat(st.tabSize), 'end'),
        'Ctrl-S': () => Commands.run('files.save'),
        'Cmd-S': () => Commands.run('files.save'),
        'Ctrl-P': () => Commands.run('ui.palette'),
        'Cmd-P': () => Commands.run('ui.palette'),
        'Ctrl-Enter': () => Commands.run('preview.refresh'),
        'Shift-Enter': () => Commands.run('preview.console.toggle'),
        'Ctrl-=': () => Commands.run('editor.zoomIn'),
        'Ctrl--': () => Commands.run('editor.zoomOut'),
        'Alt-Right': () => Commands.run('tabs.next'),
        'Alt-Left': () => Commands.run('tabs.prev'),
        'Ctrl-/': cm => cm.toggleComment(),
        'Ctrl-F': 'findPersistent',
        'Ctrl-H': 'replace',
        'Ctrl-G': 'jumpToLine',
        'Ctrl-Space': cm => cm.showHint({ completeSingle: false })
      }
    });

    this.cm.on('scroll', () => {
      const rec = this._last ? this.docs.get(this._last) : null;
      if (rec) rec.scroll = this.cm.getScrollInfo();
    });

    this.cm.on('change', (cm, change) => {
      if (this._suspendEvents || !STATE.data.activeId) return;
      if (change.origin === 'setValue') return;
      const id = STATE.data.activeId;
      const f = STATE.file(id);
      if (!f) return;
      const autoSave = STATE.settings().autoSave;
      if (!autoSave) STATE.beginUnsaved(id); /* احفظ آخر محتوى محفوظ قبل التعديل */
      f.content = cm.getValue();
      f.updatedAt = Date.now();

      if (autoSave) {
        STATE.markDirty(id, false);
        STATE._flash = true;
        STATE.persist(id);
      } else {
        STATE.markDirty(id, true);
      }
      STATE.emit('file:content', id);
    });

    this.cm.on('cursorActivity', () => {
      UI.updateCursor(this.cm.getCursor());
    });

    this._onResize = U.debounce(() => this.cm && this.cm.refresh(), 180);
    window.addEventListener('resize', this._onResize);

    STATE.on('active:change', id => this.open(id));
    STATE.on('file:renamed', id => this.docModeChanged(id));
    /* إعادة تفعيل الحفظ التلقائي يحفظ ما كان معلّقًا */
    STATE.on('settings:autoSave', on => { if (on && STATE.data.dirty.size) { STATE.clearDirty(); STATE.persist(); } }); /* clearDirty يسجّل الملفات المعلّقة تلقائيًا */
    STATE.on('settings:fontSize', v => this.setFontSize(v));
    STATE.on('settings:theme', () => this.applyTheme());
    STATE.on('settings:uiTheme', () => this.applyTheme());
    STATE.on('settings:wrapLines', v => this.cm.setOption('lineWrapping', v));
    STATE.on('settings:showLineNumbers', v => this.cm.setOption('lineNumbers', v));
    STATE.on('settings:tabSize', v => this.applyTabSize(v));
  },

  /* ---------- Docs ---------- */

  modeFor(file) {
    const lang = KC.langFor(file.name);
    return lang.mode === 'null' ? 'text/plain' : lang.mode;
  },

  docRec(id) {
    const f = STATE.file(id);
    if (!f) return null;
    let rec = this.docs.get(id);
    if (!rec) {
      const doc = CodeMirror.Doc(f.content || '', this.modeFor(f));
      rec = { doc, scroll: null };
      this.docs.set(id, rec);
    }
    return rec;
  },

  /** تبديل الملف المعروض مع حفظ/استعادة التمرير */
  open(id) {
    if (!this.cm) return;
    const prevRec = this._last ? this.docs.get(this._last) : null;
    if (prevRec && STATE.data.activeId !== id) prevRec.scroll = this.cm.getScrollInfo();
    this._last = id;

    const rec = this.docRec(id);
    if (!rec) { return; }

    this._suspendEvents = true;
    this.cm.swapDoc(rec.doc);
    this._suspendEvents = false;

    const s = rec.scroll;
    if (s && typeof s.top === 'number') this.cm.scrollTo(s.left || 0, s.top);
    this.cm.refresh();
    if (!U.isTouch()) this.cm.focus();
  },

  /** بعد إعادة التسمية: الجذور قديمة — تعاد بناؤها من المحتوى المحفوظ */
  docModeChanged(id) {
    if (!this.docs.has(id)) return;
    const wasActive = STATE.data.activeId === id;
    this.docs.delete(id);
    if (wasActive) this.open(id);
  },

  /* ---------- الإعدادات الحية ---------- */

  setFontSize(px) {
    document.documentElement.style.setProperty('--editor-font-size', px + 'px');
    if (this.cm) this.cm.refresh();
  },

  applyTabSize(v) {
    if (!this.cm) return;
    this.cm.setOption('indentUnit', v);
    this.cm.setOption('tabSize', v);
  },

  applyTheme() {
    if (!this.cm) return;
    const st = STATE.settings();
    const theme = st.uiTheme === 'light' && st.theme !== 'eclipse' ? 'eclipse' : st.theme;
    this.cm.setOption('theme', theme);
  }
};
