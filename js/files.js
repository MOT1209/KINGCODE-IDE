/* =========================================================
 * kingCode — files.js
 * الموثوق المرجعي للمشروع: إنشاء/تسمية/حذف/تنزيل/استيراد
 * مع قائمة الملفات الرسومية في الشريط الجانبي
 * ========================================================= */
'use strict';

const IMPORT_BACKUP_KEY = 'kingcode:import-backup:v1';

const FILES = {

  /** أسماء ملفات العرض UTC */
  _reservedFor(r) {
    let n = U.safeFileName(r);
    if (!n) n = 'untitled';
    return n;
  },

  _uniqueName(baseName) {
    if (!STATE.fileByName(baseName)) return baseName;
    const ext = KC.extOf(baseName);
    const stem = ext ? baseName.slice(0, -(ext.length + 1)) : baseName;
    let i = 2;
    let cand;
    do { cand = stem + '-' + i + (ext ? '.' + ext : ''); i++; }
    while (STATE.fileByName(cand) && i < 10000);
    return cand;
  },

  /* ---------- الإمداد الأساسي ---------- */

  create(name, content, { silent = false } = {}) {
    name = this._reservedFor(name);
    if (!name) { UI.toast('اسم الملف غير صالح ✋', 'warn'); return null; }
    if (STATE.files().length >= KC.limits.maxFiles) {
      UI.toast('بلغت الحد الأقصى من الملفات (' + KC.limits.maxFiles + ') ⚠️', 'warn');
      return null;
    }
    if (STATE.fileByName(name)) { UI.toast('يوجد ملف بنفس الاسم «' + name + '» 📛', 'warn'); return null; }

    if (content == null) {
      const tpl = KC.templateFor(name);
      content = tpl ? tpl.content : '';
    }

    const f = { id: U.uid(), name, content, updatedAt: Date.now() };
    STATE.data.files.push(f);
    STATE.data.tabs.push(f.id);
    STATE.persist();
    STATE.setActive(f.id);
    TABS.render();
    FILE_LIST.render();
    if (!silent) UI.toast('تم إنشاء «' + name + '» ✨');
    STATE.emit('files:change', null);
    return f;
  },

  rename(id, newName) {
    const f = STATE.file(id);
    if (!f) return;
    newName = this._reservedFor(newName);
    if (!newName) { UI.toast('الاسم غير صالح ✋', 'warn'); return; }
    if (newName === f.name) return;
    if (STATE.fileByName(newName)) { UI.toast('الاسم محجوز لملف آخر 📛', 'warn'); return; }

    const old = f.name;
    f.name = newName;
    f.updatedAt = Date.now();
    STATE.persist();
    FILE_LIST.render();
    TABS.render();
    PREVIEW.schedule(true);
    UI.updateStatusFile();
    UI.toast('تمت إعادة التسمية: ' + old + ' ← ' + newName);
    STATE.emit('file:renamed', id);
  },

  remove(id) {
    const f = STATE.file(id);
    if (!f) return;
    if (STATE.files().length <= 1) {
      UI.toast('لا يمكن حذف الملف الوحيد 🔒', 'warn');
      return;
    }
    UI.confirm({
      title: 'حذف الملف؟',
      message: 'سيمسح «' + f.name + '» نهائيًا ولا يمكن استرجاعه. هل تريد المتابعة؟',
      danger: true,
      okLabel: 'حذف نهائي'
    }, ok => {
      if (!ok) return;
      const idx = STATE.data.files.indexOf(f);
      STATE.data.files.splice(idx, 1);
      STATE.data.tabs = STATE.data.tabs.filter(t => t !== id);
      STATE.data.dirty.delete(id);

      if (STATE.data.activeId === id) {
        STATE.data.activeId = STATE.data.tabs[0] || (STATE.data.files[0] && STATE.data.files[0].id) || null;
        if (STATE.data.activeId && !STATE.data.tabs.includes(STATE.data.activeId)) {
          STATE.data.tabs.push(STATE.data.activeId);
        }
      }
      STATE.persist();
      /* تنظيف Doc من الذاكرة عند حذف الملف (منع memory leak) */
      if (EDITOR.docs.has(id)) EDITOR.docs.delete(id);
      FILE_LIST.render();
      TABS.render();
      if (STATE.data.activeId) { EDITOR.open(STATE.data.activeId); }
      else { EDITOR._last = null; EDITOR.cm.swapDoc(CodeMirror.Doc('', 'text/plain')); }
      PREVIEW.schedule(true);
      UI.updateStatusFile();
      UI.toast('تم حذف «' + f.name + '» 🗑');
      STATE.emit('files:change', null);
    });
  },

  duplicate(id) {
    const f = STATE.file(id);
    if (!f) return;
    const ext = KC.extOf(f.name);
    const stem = ext ? f.name.slice(0, -(ext.length + 1)) : f.name;
    const name = this._uniqueName(stem + ' copy' + (ext ? '.' + ext : ''));
    return this.create(name, f.content);
  },

  newFile() {
    UI.prompt({ title: 'ملف جديد', placeholder: 'مثال: app.js أو style.css' }, name => {
      if (name) this.create(name);
    });
  },

  renameUI(id) {
    const f = STATE.file(id);
    if (!f) return;
    UI.prompt({ title: 'إعادة تسمية «' + f.name + '»', value: f.name }, name => {
      if (name && name !== f.name) this.rename(id, name);
    });
  },

  saveFile(id) {
    const f = STATE.file(id);
    if (!f) return;
    if (STATE.data.activeId === id && EDITOR.cm) {
      f.content = EDITOR.cm.getValue();
    }
    STATE.markDirty(id, false);
    STATE.persist();
    UI.saveFlash('done');
    UI.toast('حُفظ «' + f.name + '» 💾');
    STATE.emit('file:content', id);
  },

  /* ---------- تنزيل / استيراد ---------- */

  download(id) {
    const f = STATE.file(id);
    if (!f) return;
    const mime = { 'html': 'text/html', 'css': 'text/css', 'js': 'text/javascript', 'mjs': 'text/javascript' }
      [KC.extOf(f.name)] || 'text/plain';
    if (U.downloadText(f.name, f.content, mime)) UI.toast('تم تنزيـل «' + f.name + '» ⤓');
  },

  exportProject() {
    const payload = STATE.files().map(f => ({ [f.name]: f.content }));
    if (U.downloadText('kingcode-project.json', JSON.stringify(Object.assign({}, ...payload), null, 2), 'application/json')) {
      UI.toast('تم تصدير المشروع 📦');
    }
  },

  exportProjectHTML() {
    const html = PREVIEW.buildDocument();
    if (U.downloadText('kingcode-project.html', html, 'text/html')) {
      UI.toast('تم تصدير المشروع كملف HTML مستقل 🌐');
    }
  },

  /* ---------- نسخة احتياطية ما قبل الاستيراد (بند 1.6 من docs/audit/DEVELOPMENT_ROADMAP) ---------- */

  /** يصوغ نسخة احتياطية من المشروع الحالي قبل استبداله بالاستيراد؛ يعيد true عند النجاح، وإلا يسجّل تحذيرًا في الكونسول (جهد وليس ضمانًا) */
  _backupCurrent() {
    try {
      const files = STATE.files().map(f => ({ [f.name]: f.content }));
      localStorage.setItem(IMPORT_BACKUP_KEY, JSON.stringify({ savedAt: Date.now(), files: Object.assign({}, ...files) }));
      return true;
    } catch (e) {
      console.warn('[kingCode] import backup skipped:', (e && e.message) || e);
      return false;
    }
  },

  /** يطبّق ملفات مشروع جديد (نتيجة U.sanitizeFiles) بعد التنقية والتأكيد — مستخرج من importProject الأصلية */
  _applyImported(files, note) {
    STATE.data.files = files;
    STATE.data.tabs = [files[0].id];
    STATE.data.activeId = files[0].id;
    STATE.data.dirty.clear();
    STATE.persist();
    EDITOR.docs.clear();
    FILE_LIST.render();
    TABS.render();
    STATE.setActive(files[0].id);
    PREVIEW.schedule(true);
    UI.toast(note || ('تم استيراد ' + files.length + ' ملف 📥'));
    STATE.emit('files:change', null);
  },

  /** استعادة آخر نسخة احتياطية (لوحة الأوامر: «ملفات ← استعادة نسخة ما قبل الاستيراد») */
  restoreBackup() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(IMPORT_BACKUP_KEY) || 'null'); }
    catch (e) { raw = null; }
    if (!raw || !raw.files) { UI.toast('لا توجد نسخة احتياطية للمشروع السابق 🔒', 'warn'); return; }
    const files = U.sanitizeFiles(raw.files);
    if (!files) { UI.toast('النسخة الاحتياطية تالفة ولا يمكن استعادتها', 'error'); return; }
    const when = raw.savedAt ? new Date(raw.savedAt).toLocaleString('ar') : '';
    const before = STATE.files().length;
    UI.confirm({
      title: 'استعادة النسخة الاحتياطية؟',
      message: 'سيستبدل المشروع الحالي (' + before + ' ملف) بالنسخة المحفوظة' + (when ? ' بتاريخ ' + when : '') + ' (' + files.length + ' ملف). المتابعة؟',
      okLabel: 'استعادة'
    }, ok => {
      if (!ok) return;
      this._applyImported(files, 'استُعيد المشروع السابق من النسخة الاحتياطية (' + files.length + ' ملف) ↩️');
    });
  },

  importProject() {
    const input = U.$('#import-json-input');
    input.onchange = async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      try {
        /* تنقية كاملة قبل اللمس بالحالة (SC-05): ملف تالف يُكتشف قبل أي استبدال */
        const parsed = JSON.parse(await U.readText(file));
        const files = U.sanitizeFiles(parsed);
        if (!files) throw new Error('بنية غير معروفة');
        /* بند 1.6: نسخة احتياطية قبل الاستبدال + تأكيد صريح — لا استبدال صامت */
        const current = STATE.files().length;
        const backupOk = this._backupCurrent();
        UI.confirm({
          title: 'استيراد مشروع؟',
          message: 'سيستبدل المشروع الحالي (' + current + ' ملف) بمحتوى الملف المختار (' + files.length + ' ملف).'
            + (backupOk ? ' حُفظت نسخة احتياطية، وتُستعاد من لوحة الأوامر «استعادة نسخة ما قبل الاستيراد».' : ' تعذّر حفظ نسخة احتياطية (المخزن ممتلئ؟) — لن تكون هناك فرصة رجوع!'),
          danger: true,
          okLabel: 'استيراد واستبدال'
        }, ok => {
          if (ok) this._applyImported(files);
        });
      } catch (e) {
        UI.toast('فشل استيراد JSON: ' + e.message, 'error');
      }
    };
    input.click();
  },

  /** استيراد ملفات نصية متعددة (من الشريط الجانبي ⭱) */
  importFiles() {
    const input = U.$('#import-files-input');
    input.onchange = async () => {
      const list = Array.from(input.files || []);
      input.value = '';
      if (!list.length) return;
      let n = 0, skipped = 0;
      for (const file of list) {
        try {
          const name = this._uniqueName(this._reservedFor(file.name));
          const content = await U.readText(file);
          if (STATE.files().length >= KC.limits.maxFiles) { skipped++; continue; }
          STATE.data.files.push({ id: U.uid(), name, content, updatedAt: Date.now() });
          n++;
        } catch (e) { skipped++; }
      }
      if (n) {
        STATE.persist();
        FILE_LIST.render();
        PREVIEW.schedule(true);
        UI.toast('استوردنا ' + n + ' ملف' + (skipped ? ' (تم إسقاط ' + skipped + ')' : '') + ' 📥');
        STATE.emit('files:change', null);
      } else {
        UI.toast('لم نتمكن من استيراد أي ملف', 'warn');
      }
    };
    input.click();
  },

  /* ---------- القائمة الرسومية ---------- */

  render() { FILE_LIST.render(); }
};
