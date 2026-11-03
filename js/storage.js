/* =========================================================
 * kingCode — storage.js
 * طبقة التخزين: واجهة واحدة غير متزامنة بخلفيتين
 *   - 'idb'  : IndexedDB (الافتراضي) — سجل لكل ملف + سجل meta؛ سعة بالجيجابايت، كتابة تفاضلية (الملفات المتغيرة فقط)
 *   - 'local': localStorage (احتياطي إن تعذّر IndexedDB، مثل بعض الأوضاع الخاصة) — كتلة JSON واحدة
 * ترحيل تلقائي من كتلة localStorage القديمة (kingcode:state:v1) عند أول تشغيل بـ IDB (تبقى كنسخة احتياطية).
 * سجل طوارئ (journal) متزامن في localStorage يُكتب عند مغادرة الصفحة لأن معاملات IDB لا تُنتظر عند الإغلاق،
 * ويُطبَّق عند الإقلاع التالي إن كان أحدث من آخر حفظ.
 * ========================================================= */
'use strict';

const STORE = {
  kind: 'none',          // 'idb' | 'local' بعد init()
  _db: null,
  _known: new Set(),     // ids الملفات الموجودة حاليًا في IDB (لحذف المحذوف)

  LEGACY_KEY: 'kingcode:state:v1',
  JOURNAL_KEY: 'kingcode:journal:v1',
  LEGACY_BACKUP_KEY: 'kingcode:import-backup:v1',
  JOURNAL_MAX_CHARS: 1500000,

  /* ---------- التهيئة ---------- */

  async init() {
    if (this.kind !== 'none') return this.kind;
    try {
      this._db = await this._openIdb();
      this.kind = 'idb';
      /* يطلب عدم إخلاء التخزين تلقائيًا (أفضل جهد) */
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
    } catch (e) {
      console.warn('[kingCode] IndexedDB unavailable, using localStorage:', (e && e.message) || e);
      this.kind = 'local';
    }
    return this.kind;
  },

  _openIdb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined' || !indexedDB) { reject(new Error('indexedDB undefined')); return; }
      let req;
      try { req = indexedDB.open('kingcode', 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        /* تبويب آخر يحذف/يرقّي قاعدة البيانات (مسح بيانات الموقع، ترقية بنية): أغلق اتصالنا كي لا نحجبه؛
           تُعاد فتحها عند الحفظ التالي وتُكتب كل الملفات من جديد (_known فارغة) */
        db.onversionchange = () => { try { db.close(); } catch (_) { /* ignore */ } if (this._db === db) { this._db = null; this._known = new Set(); } };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('idb open error'));
      req.onblocked = () => reject(new Error('idb open blocked'));
    });
  },

  /* ---------- أدوات IDB ---------- */

  _run(stores, mode, work) {
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = this._db.transaction(stores, mode); } catch (e) { reject(e); return; }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('idb tx error'));
      tx.onabort = () => reject(tx.error || new Error('idb tx aborted'));
      try { work(tx); } catch (e) { try { tx.abort(); } catch (_) {} reject(e); }
    });
  },

  _req(store, fn) {
    return new Promise((resolve, reject) => {
      let tx, req;
      try { tx = this._db.transaction(store, 'readonly'); req = fn(tx.objectStore(store)); } catch (e) { reject(e); return; }
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  /* ---------- القراءة ---------- */

  /** يعيد لقطة الحالة { files, tabs, activeId, settings, uiPrefs, folders } أو null (لا بيانات سابقة) */
  async load() {
    let snap;
    try {
      if (this.kind === 'idb') {
        const meta = await this._req('meta', s => s.get('state'));
        if (meta) {
          const recs = await this._req('files', s => s.getAll());
          const byId = new Map(recs.map(r => [r.id, r]));
          const ordered = [];
          for (const id of (meta.order || [])) if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); }
          for (const r of byId.values()) ordered.push(r);
          snap = Object.assign({}, meta, { files: ordered });
          this._known = new Set(ordered.map(f => f.id));
        } else {
          snap = this._readLegacy(); /* ترحيل: أول تشغيل بعد الترقية */
          if (snap) snap._migrated = true;
        }
      } else {
        snap = this._readLegacy();
      }
    } catch (e) {
      console.warn('[kingCode] storage load failed:', (e && e.message) || e);
      snap = this._readLegacy();
    }
    return this._applyJournal(snap);
  },

  _readLegacy() {
    try {
      const raw = localStorage.getItem(this.LEGACY_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  /* ---------- الكتابة ---------- */

  /**
   * snapshot: { files:[{id,name,content,updatedAt}], tabs, activeId, settings, uiPrefs, folders }
   * changedIds: مصفوفة ids الملفات المتغيرة، أو null = كل الملفات. يعيد Promise<boolean>.
   */
  async save(snapshot, changedIds) {
    const savedAt = Date.now();
    if (this.kind === 'idb') {
      try {
        if (!this._db) { this._db = await this._openIdb(); this._known = new Set(); } /* أُغلق بـ versionchange: أعد الفتح */
        const all = changedIds === null;
        const changed = new Set(changedIds || []);
        const present = new Set(snapshot.files.map(f => f.id));
        const known = this._known;
        await this._run(['meta', 'files'], 'readwrite', tx => {
          const fs = tx.objectStore('files');
          for (const id of known) if (!present.has(id)) fs.delete(id);
          for (const f of snapshot.files) {
            if (all || changed.has(f.id) || !known.has(f.id)) fs.put({ id: f.id, name: f.name, content: f.content, updatedAt: f.updatedAt });
          }
          tx.objectStore('meta').put({
            v: 2, order: snapshot.files.map(f => f.id), tabs: snapshot.tabs, activeId: snapshot.activeId,
            settings: snapshot.settings, uiPrefs: snapshot.uiPrefs, folders: snapshot.folders || [], savedAt
          }, 'state');
        });
        this._known = present;
        return true;
      } catch (e) {
        console.warn('[kingCode] IDB write failed:', (e && e.name) || e);
        return false;
      }
    }
    return this._saveLocal(snapshot, savedAt);
  },

  _saveLocal(snapshot, savedAt) {
    try {
      localStorage.setItem(this.LEGACY_KEY, JSON.stringify({
        v: 1, files: snapshot.files, tabs: snapshot.tabs, activeId: snapshot.activeId,
        settings: snapshot.settings, uiPrefs: snapshot.uiPrefs, folders: snapshot.folders || [], savedAt: savedAt || Date.now()
      }));
      return true;
    } catch (e) {
      console.warn('[kingCode] localStorage write failed:', (e && e.name) || e);
      return false;
    }
  },

  /** كتابة متزامنة عند مغادرة الصفحة: localStorage مباشرة؛ IDB عبر سجل طوارئ صغير (أفضل جهد) */
  saveSync(snapshot, changedFiles, full = false) {
    if (this.kind === 'local') return this._saveLocal(snapshot);
    try {
      /* full=true: السجل يحوي كل ملفات المشروع (حفظ أول/استيراد) فيصلح مشروعًا كاملًا بذاته؛ وإلا فهو تغييرات جزئية */
      const j = JSON.stringify({ t: Date.now(), full: !!full, files: changedFiles, tabs: snapshot.tabs, activeId: snapshot.activeId, folders: snapshot.folders || [] });
      if (j.length > this.JOURNAL_MAX_CHARS) return false;
      localStorage.setItem(this.JOURNAL_KEY, j);
      return true;
    } catch (e) { return false; }
  },

  clearJournal() { try { localStorage.removeItem(this.JOURNAL_KEY); } catch (_) {} },

  /**
   * قواعد تطبيق سجل الطوارئ (كتبه pagehide عندما لم تكتمل كتابة IndexedDB):
   *  - سجل كامل (full): هو كل المشروع؛ يُطبَّق كاستبدال إن كان أحدث من آخر حفظ (أو لا حفظ سابق) — حتى فوق لقطة مُرحَّلة.
   *  - سجل جزئي: تغييرات فوق لقطة محفوظة بالصيغة الجديدة (لها savedAt) فقط؛ لا يُدمج في مشروع مُرحَّل ولا يصلح وحده مشروعًا.
   * ما لا يُطبَّق يُمسح كي لا يتراكم أو يلوّث إقلاعًا لاحقًا.
   */
  _applyJournal(snap) {
    let j;
    try { const raw = localStorage.getItem(this.JOURNAL_KEY); j = raw ? JSON.parse(raw) : null; } catch (_) { j = null; }
    if (!j || !Array.isArray(j.files) || !j.files.length) return snap;
    const valid = j.files.filter(f => f && typeof f.id === 'string' && typeof f.name === 'string');
    const savedAt = (snap && snap.savedAt) || 0;
    if (!valid.length || j.t <= savedAt) { this.clearJournal(); return snap; }

    if (j.full) {
      return Object.assign({}, snap || {}, {
        files: valid, tabs: Array.isArray(j.tabs) ? j.tabs : [], activeId: j.activeId || (valid[0] && valid[0].id),
        folders: Array.isArray(j.folders) ? j.folders : ((snap && snap.folders) || []), _fromJournal: true
      });
    }
    if (!snap || !snap.savedAt || snap._migrated) { this.clearJournal(); return snap; }

    const files = (snap.files || []).slice();
    for (const jf of valid) {
      const i = files.findIndex(f => f.id === jf.id);
      if (i >= 0) files[i] = Object.assign({}, files[i], jf); else files.push(jf);
    }
    return Object.assign({}, snap, { files, tabs: Array.isArray(j.tabs) ? j.tabs : snap.tabs, activeId: j.activeId || snap.activeId, _fromJournal: true });
  },

  /* ---------- نسخة ما قبل الاستيراد ---------- */

  async putBackup(obj) {
    try {
      if (this.kind === 'idb') { await this._run(['meta'], 'readwrite', tx => tx.objectStore('meta').put(obj, 'importBackup')); return true; }
      localStorage.setItem(this.LEGACY_BACKUP_KEY, JSON.stringify(obj));
      return true;
    } catch (e) { console.warn('[kingCode] backup write failed:', (e && e.name) || e); return false; }
  },

  async getBackup() {
    try {
      if (this.kind === 'idb') {
        const b = await this._req('meta', s => s.get('importBackup'));
        if (b) return b;
      }
      const raw = localStorage.getItem(this.LEGACY_BACKUP_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
};
