/* =========================================================
 * kingCode — state.js
 * الحالة المركزية: الملفات، التبويبات، الإعدادات، المفسرات
 * البنية فلات ومسطحة + نظام بث أحداث ضيق
 * ========================================================= */
'use strict';

const STATE = {
  /* ---------- البيانات ---------- */
  data: {
    files: [],          // [{id, name, content, updatedAt}]
    tabs: [],           // [id] بترتيب الفتح
    activeId: null,
    dirty: new Set(),   // files with unsaved buffer (autoSave = off)
    committed: new Map(), // id -> last saved content of a dirty file (what persist() writes while autoSave is off)
    settings: {
      theme: 'ayu-mirage',
      uiTheme: 'dark',
      fontSize: 14,
      tabSize: 2,
      wrapLines: false,
      showLineNumbers: true,
      autoSave: true,
      autoPreview: true,
      showPreview: true,
      consoleOpen: true
    },
    uiPrefs: {
      previewWidth: 0,  // 0 = تلقائي (grid)
      sidebarOpen: true
    }
  },

  /* ---------- نظام الأحداث (نشر/اشتراك) ---------- */
  _subs: new Map(),

  on(event, fn) {
    if (!this._subs.has(event)) this._subs.set(event, new Set());
    this._subs.get(event).add(fn);
    return () => this._subs.get(event)?.delete(fn);
  },

  emit(event, payload) {
    const subs = this._subs.get(event);
    if (subs) subs.forEach(fn => { try { fn(payload); } catch (e) { console.error('[kingCode] handler '+event, e); } });
    const all = this._subs.get('*');
    if (all) all.forEach(fn => { try { fn({ event, payload }); } catch (e) { console.error('[kingCode] wildcard', e); } });
  },

  /* ---------- الـ Setters المركزية ---------- */

  files() { return this.data.files; },
  file(id) { return this.data.files.find(f => f.id === id) || null; },
  fileByName(name) { return this.data.files.find(f => f.name === name) || null; },
  settings() { return this.data.settings; },
  uiPrefs() { return this.data.uiPrefs; },

  setActive(id) {
    if (!this.file(id)) return;
    if (this.data.activeId === id) return;
    this.data.activeId = id;
    this.persist();
    this.emit('active:change', id);
  },

  setSetting(key, value) {
    if (!(key in this.data.settings)) return;
    this.data.settings[key] = value;
    this.persist();
    this.emit('settings:change', { key, value });
    this.emit('settings:' + key, value);
  },

  setPref(key, value) {
    /* بدون بثّ إذا لم يتغيَّر: يمنع حلقات الاستدعاء العكسي */
    if (this.data.uiPrefs[key] === value) return;
    this.data.uiPrefs[key] = value;
    this.persist();
    this.emit('pref:' + key, value);
  },

  markDirty(id, on) {
    const has = this.data.dirty.has(id);
    if (on && !has) { this.data.dirty.add(id); this.emit('dirty', true); }
    else if (!on && has) { this.data.dirty.delete(id); this.data.committed.delete(id); this.emit('dirty', false); }
  },
  /** يسجّل المحتوى المحفوظ قبل أول تعديل غير محفوظ (يُستدعى قبل تغيير f.content) */
  beginUnsaved(id) {
    const f = this.file(id);
    if (f && !this.data.dirty.has(id) && !this.data.committed.has(id)) this.data.committed.set(id, f.content);
  },
  clearDirty() {
    const had = this.data.dirty.size > 0;
    this.data.dirty.clear();
    this.data.committed.clear();
    if (had) this.emit('dirty', false);
  },
  isDirty(id) { return this.data.dirty.has(id); },

  /* ---------- التخزين الدائم ---------- */
  _persistDeb: null,
  _pending: false,

  /** يكتب الحالة فورًا؛ يعيد true عند النجاح. الملفات غير المحفوظة (autoSave=off) تُكتب بآخر محتوى محفوظ لا بالتعديل الجاري. */
  _write() {
    this._pending = false;
    const d = this.data;
    const files = d.files.map(f => (d.dirty.has(f.id) && d.committed.has(f.id))
      ? Object.assign({}, f, { content: d.committed.get(f.id) }) : f);
    const ok = U.storage.set(KC.storageKey, {
      v: 1, files, tabs: d.tabs, activeId: d.activeId, settings: d.settings, uiPrefs: d.uiPrefs
    });
    this.saveFailed = !ok;
    this.emit('persisted', { ok });
    return ok;
  },

  persist() {
    this._pending = true;
    if (this._persistDeb) this._persistDeb.cancel();
    this._persistDeb = U.debounce(() => this._write(), KC.timing.persist);
    this._persistDeb();
  },

  /** كتابة فورية لأي حفظ معلّق (pagehide/visibilitychange/حفظ يدوي). يعيد true إذا لا شيء معلّق أو نجحت الكتابة. */
  flush() {
    if (this._persistDeb) this._persistDeb.cancel();
    return this._pending ? this._write() : !this.saveFailed;
  },
  saveFailed: false,

  /** يستعيد الحالة من التخزين — يعيد true إن وُجدت بيانات سابقة */
  hydrate() {
    const raw = U.storage.get(KC.storageKey, null);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.files)) return false;

    /* ملفات: تحقق وانتقاء */
    const files = raw.files
      .filter(f => f && typeof f.name === 'string')
      .map(f => ({
        id: typeof f.id === 'string' ? f.id : U.uid(),
        name: U.safeFileName(f.name) || U.uid(),
        content: typeof f.content === 'string' ? f.content : '',
        updatedAt: Number(f.updatedAt) || Date.now()
      }));
    if (!files.length) return false;

    const names = new Set(files.map(f => f.name));
    const ids = new Set(files.map(f => f.id));
    if (names.size !== files.length) {
      console.warn('[kingCode] duplicate file names in storage — normalizing…');
      const seen = new Set();
      files.forEach(f => {
        if (seen.has(f.name)) {
          /* لاحقة التفرد: العدد يتصاعد حتى اسم غير مُستخدَم فعلاً
             (الصياغة القديمة كانت " (2)" ثابتة فتتصادم ثلاثة سجلات فأكثر) */
          const m = f.name.match(/^(.+?)(\.\w+)?$/);
          const base = m ? m[1] : String(f.name);
          const ext = m && m[2] ? m[2] : '';
          let n = 2;
          let candidate = `${base} (${n})${ext}`;
          while (seen.has(candidate)) { n += 1; candidate = `${base} (${n})${ext}`; }
          f.name = U.safeFileName(candidate) || U.uid();
        }
        seen.add(f.name);
      });
    }

    this.data.files = files;

    /* تبويبات صالحة فقط */
    this.data.tabs = (Array.isArray(raw.tabs) ? raw.tabs : [])
      .filter(t => t !== null && t !== undefined)
      .map(t => (typeof t === 'object' && 'id' in t ? t.id : t))
      .filter(t => ids.has(t));

    /* الملف النشط */
    this.data.activeId = ids.has(raw.activeId) ? raw.activeId
      : (this.data.tabs.length ? this.data.tabs[0] : files[0].id);
    if (!this.data.tabs.includes(this.data.activeId)) {
      this.data.tabs.unshift(this.data.activeId);
    }

    /* الإعدادات بدمج آمن */
    const st = raw.settings || {};
    for (const k of Object.keys(this.data.settings)) {
      if (k in st) this.data.settings[k] = st[k];
    }
    const up = raw.uiPrefs || {};
    for (const k of Object.keys(this.data.uiPrefs)) {
      if (k in up) this.data.uiPrefs[k] = up[k];
    }
    return true;
  },

  /** بداية نظيفة: يولّد الملفات الافتراضية */
  bootstrapDefaults() {
    this.data.files = KC.DEFAULT_FILES.map(f => ({
      id: U.uid(),
      name: f.name,
      content: f.content,
      updatedAt: Date.now()
    }));
    this.data.tabs = [this.data.files[0].id];
    this.data.activeId = this.data.files[0].id;
    this.persist();
    return true;
  }
};
