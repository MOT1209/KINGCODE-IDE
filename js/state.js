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
    folders: [],        // مجلدات فارغة صريحة (المجلدات غير الفارغة تُستنتج من مسارات الملفات)
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
    else if (!on && has) { this.data.dirty.delete(id); this.data.committed.delete(id); this._changed.add(id); this.emit('dirty', false); }
  },
  /** يسجّل المحتوى المحفوظ قبل أول تعديل غير محفوظ (يُستدعى قبل تغيير f.content) */
  beginUnsaved(id) {
    const f = this.file(id);
    if (f && !this.data.dirty.has(id) && !this.data.committed.has(id)) this.data.committed.set(id, f.content);
  },
  clearDirty() {
    const had = this.data.dirty.size > 0;
    this.data.dirty.forEach(id => this._changed.add(id));
    this.data.dirty.clear();
    this.data.committed.clear();
    if (had) this.emit('dirty', false);
  },
  isDirty(id) { return this.data.dirty.has(id); },

  /* ---------- مسار الكتابة الوحيد لملفات المشروع ----------
     كل إنشاء/إعادة تسمية/حذف/استبدال يمر من هنا: وحده يفرض الثوابت (اسم فريد، الحد الأقصى للعدد،
     اتساق التبويبات والملف النشط). لا أثر على الـ DOM — الواجهة تبقى في FILES. */

  /** اسم غير مستخدم: يضيف -2، -3… قبل الامتداد عند التكرار */
  uniqueName(baseName) {
    if (!this.fileByName(baseName)) return baseName;
    const dot = baseName.lastIndexOf('.');
    const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
    const ext = dot > 0 ? baseName.slice(dot) : '';
    let i = 2, cand;
    do { cand = stem + '-' + i + ext; i++; } while (this.fileByName(cand) && i < 100000);
    return cand;
  },

  /** يضيف ملفًا. يعيد { ok:true, file } أو { ok:false, reason:'invalid'|'limit'|'duplicate' } */
  addFile(name, content, { tab = true } = {}) {
    name = U.safeFileName(name);
    if (!name || name === '.' || name === '..') return { ok: false, reason: 'invalid' };
    if (this.data.files.length >= KC.limits.maxFiles) return { ok: false, reason: 'limit' };
    if (this.fileByName(name)) return { ok: false, reason: 'duplicate' };
    const f = { id: U.uid(), name, content: typeof content === 'string' ? content : '', updatedAt: Date.now() };
    this.data.files.push(f);
    if (tab) {
      if (this.data.tabs.length >= KC.limits.tabsMax) {
        /* لا نُخرج التبويب النشط عند بلوغ الحد */
        const victim = this.data.tabs.find(t => t !== this.data.activeId);
        if (victim) this.data.tabs.splice(this.data.tabs.indexOf(victim), 1);
      }
      this.data.tabs.push(f.id);
    }
    this.persist();
    return { ok: true, file: f };
  },

  /** يعيد تسمية ملف. يعيد { ok, reason?, old?, file? } */
  renameFile(id, newName) {
    const f = this.file(id);
    if (!f) return { ok: false, reason: 'missing' };
    newName = U.safeFileName(newName);
    if (!newName || newName === '.' || newName === '..') return { ok: false, reason: 'invalid' };
    if (newName === f.name) return { ok: false, reason: 'same' };
    if (this.fileByName(newName)) return { ok: false, reason: 'duplicate' };
    const old = f.name;
    f.name = newName;
    f.updatedAt = Date.now();
    this.persist(id);
    return { ok: true, old, file: f };
  },

  /** يحذف ملفًا (لا يحذف الوحيد). يعيد { ok, reason?, activeId } حيث activeId هو الملف النشط بعد الحذف */
  removeFile(id) {
    const f = this.file(id);
    if (!f) return { ok: false, reason: 'missing' };
    if (this.data.files.length <= 1) return { ok: false, reason: 'last' };
    this.data.files.splice(this.data.files.indexOf(f), 1);
    this.data.tabs = this.data.tabs.filter(t => t !== id);
    this.markDirty(id, false);
    if (this.data.activeId === id) {
      this.data.activeId = this.data.tabs[0] || (this.data.files[0] && this.data.files[0].id) || null;
      if (this.data.activeId && !this.data.tabs.includes(this.data.activeId)) this.data.tabs.push(this.data.activeId);
    }
    this.persist();
    return { ok: true, activeId: this.data.activeId, file: f };
  },

  /** يستبدل المشروع كاملًا بملفات سليمة (ناتج U.sanitizeFiles().files) */
  replaceProject(files) {
    this.data.files = files.slice(0, KC.limits.maxFiles);
    this.data.tabs = [this.data.files[0].id];
    this.data.activeId = this.data.files[0].id;
    this.clearDirty();
    this.persist(this.ALL);
  },

  /* ---------- التخزين الدائم ----------
     الكتابة غير متزامنة عبر STORE (IndexedDB أو localStorage). persist(ids) يسجّل الملفات المتغيرة فقط
     (persist() بلا معامل = الإعدادات/التبويبات/النشط فقط؛ persist(STATE.ALL) = كل الملفات)، ثم تُجمَّع الكتابات
     بـ debounce وتُسلسَل (لا كتابتان متوازيتان). الملفات غير المحفوظة (autoSave=off) تُكتب بآخر محتوى محفوظ. */
  ALL: '*',
  _persistDeb: null,
  _pending: false,
  _changed: new Set(),
  _all: false,
  _chain: Promise.resolve(true),
  saveFailed: false,

  _snapshot() {
    const d = this.data;
    const files = d.files.map(f => (d.dirty.has(f.id) && d.committed.has(f.id))
      ? Object.assign({}, f, { content: d.committed.get(f.id) }) : f);
    return { files, tabs: d.tabs, activeId: d.activeId, settings: d.settings, uiPrefs: d.uiPrefs, folders: d.folders };
  },

  async _write() {
    if (!this._pending) return !this.saveFailed;
    this._pending = false;
    const all = this._all;
    const ids = all ? null : Array.from(this._changed);
    this._all = false;
    this._changed = new Set();
    const startedAt = Date.now();
    const snapshot = this._snapshot();
    let ok = false;
    try { ok = await STORE.save(snapshot, ids); } catch (e) { ok = false; }
    if (!ok) {
      /* لا نفقد معلومة «ما الذي لم يُكتب»: أعد وسمه ليُعاد في المحاولة التالية */
      if (all) this._all = true; else (ids || []).forEach(i => this._changed.add(i));
      this._pending = true;
    } else if (!this._pending) {
      STORE.clearJournal(startedAt);
    }
    this.saveFailed = !ok;
    this.emit('persisted', { ok });
    return ok;
  },

  persist(ids) {
    if (ids === this.ALL) this._all = true;
    else if (typeof ids === 'string') this._changed.add(ids);
    else if (Array.isArray(ids)) ids.forEach(i => this._changed.add(i));
    this._pending = true;
    if (this._persistDeb) this._persistDeb.cancel();
    this._persistDeb = U.debounce(() => { this._chain = this._chain.then(() => this._write()); }, KC.timing.persist);
    this._persistDeb();
  },

  /** كتابة فورية لأي حفظ معلّق (حفظ يدوي/قبل التحديث). يعيد Promise<boolean>. */
  flush() {
    if (this._persistDeb) this._persistDeb.cancel();
    this._chain = this._chain.then(() => this._write());
    return this._chain;
  },

  /** عند pagehide/visibilitychange: لا يمكن انتظار الكتابة غير المتزامنة — اكتب سجل طوارئ متزامنًا ثم ابدأ الكتابة العادية */
  flushSync() {
    if (!this._pending) return;
    const ids = this._all ? this.data.files.map(f => f.id) : Array.from(this._changed);
    const snap = this._snapshot();
    const changedFiles = snap.files.filter(f => ids.includes(f.id));
    STORE.saveSync(snap, changedFiles);
    this.flush();
  },

  /** يستعيد الحالة من التخزين — يعيد true إن وُجدت بيانات سابقة */
  hydrate(raw) {
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
    this.data.folders = Array.isArray(raw.folders) ? raw.folders.filter(x => typeof x === 'string') : [];

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
    this.persist(this.ALL);
    return true;
  }
};
