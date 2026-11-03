/* =========================================================
 * kingCode — files.js
 * الموثوق المرجعي للمشروع: إنشاء/تسمية/حذف/تنزيل/استيراد
 * مع قائمة الملفات الرسومية في الشريط الجانبي
 * ========================================================= */
'use strict';

const FILES = {

  /** أسماء ملفات العرض UTC */
  _reservedFor(r) {
    let n = U.safeFileName(r);
    if (!n) n = 'untitled';
    return n;
  },

  /* ---------- الإمداد الأساسي (الواجهة فقط؛ الثوابت في STATE) ---------- */

  REASONS: {
    invalid: ['اسم الملف غير صالح ✋', 'warn'],
    limit: ['بلغت الحد الأقصى من الملفات (' + KC.limits.maxFiles + ') ⚠️', 'warn'],
    duplicate: ['يوجد ملف بنفس الاسم 📛', 'warn']
  },

  create(name, content, { silent = false } = {}) {
    name = this._reservedFor(name);
    if (content == null) {
      const tpl = KC.templateFor(name);
      content = tpl ? tpl.content : '';
    }
    const r = STATE.addFile(name, content);
    if (!r.ok) { const m = this.REASONS[r.reason]; UI.toast(m[0], m[1]); return null; }
    const f = r.file;
    STATE.setActive(f.id);
    TABS.render();
    FILE_LIST.render();
    if (!silent) UI.toast('تم إنشاء «' + f.name + '» ✨');
    STATE.emit('files:change', null);
    return f;
  },

  rename(id, newName) {
    const r = STATE.renameFile(id, this._reservedFor(newName));
    if (!r.ok) {
      if (r.reason === 'duplicate') UI.toast('الاسم محجوز لملف آخر 📛', 'warn');
      else if (r.reason === 'invalid') UI.toast('الاسم غير صالح ✋', 'warn');
      return;
    }
    FILE_LIST.render();
    TABS.render();
    PREVIEW.schedule(true);
    UI.updateStatusFile();
    UI.toast('تمت إعادة التسمية: ' + r.old + ' ← ' + r.file.name);
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
      const r = STATE.removeFile(id);
      if (!r.ok) return;
      /* تنظيف Doc من الذاكرة عند حذف الملف (منع memory leak) */
      if (EDITOR.docs.has(id)) EDITOR.docs.delete(id);
      FILE_LIST.render();
      TABS.render();
      if (r.activeId) { EDITOR.open(r.activeId); }
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
    const name = STATE.uniqueName(stem + ' copy' + (ext ? '.' + ext : ''));
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

  async saveFile(id) {
    const f = STATE.file(id);
    if (!f) return;
    if (STATE.data.activeId === id && EDITOR.cm) {
      f.content = EDITOR.cm.getValue();
    }
    STATE.markDirty(id, false);
    STATE.persist(id);
    if (await STATE.flush()) {
      UI.saveFlash('done');
      UI.toast('حُفظ «' + f.name + '» 💾');
    } else {
      UI.toast('تعذّر الحفظ: مساحة التخزين ممتلئة — صدِّر المشروع الآن ⚠️', 'error', 6000);
    }
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
    const html = PREVIEW.buildDocument({ bridge: false });
    if (U.downloadText('kingcode-project.html', html, 'text/html')) {
      UI.toast('تم تصدير المشروع كملف HTML مستقل 🌐');
    }
  },

  /* ---------- نسخة احتياطية ما قبل الاستيراد (بند 1.6 من docs/audit/DEVELOPMENT_ROADMAP) ---------- */

  /** يصوغ نسخة احتياطية من المشروع الحالي قبل استبداله بالاستيراد؛ يعيد true عند النجاح، وإلا يسجّل تحذيرًا في الكونسول (جهد وليس ضمانًا) */
  async _backupCurrent() {
    const files = STATE.files().map(f => ({ [f.name]: f.content }));
    return STORE.putBackup({ savedAt: Date.now(), files: Object.assign({}, ...files) });
  },

  /** يطبّق ملفات مشروع جديد (نتيجة U.sanitizeFiles) بعد التنقية والتأكيد — مستخرج من importProject الأصلية */
  _applyImported(files, note) {
    STATE.replaceProject(files);
    EDITOR.docs.clear();
    FILE_LIST.render();
    TABS.render();
    /* activeId تغيّر داخل replaceProject (setActive كان سيتجاهله): نبثّ الحدث ليفتح المحرر الملف الجديد */
    STATE.emit('active:change', STATE.data.activeId);
    PREVIEW.schedule(true);
    UI.toast(note || ('تم استيراد ' + files.length + ' ملف 📥'));
    STATE.emit('files:change', null);
  },

  /** استعادة آخر نسخة احتياطية (لوحة الأوامر: «ملفات ← استعادة نسخة ما قبل الاستيراد») */
  async restoreBackup() {
    const raw = await STORE.getBackup();
    if (!raw || !raw.files) { UI.toast('لا توجد نسخة احتياطية للمشروع السابق 🔒', 'warn'); return; }
    const clean = U.sanitizeFiles(raw.files);
    if (!clean) { UI.toast('النسخة الاحتياطية تالفة ولا يمكن استعادتها', 'error'); return; }
    const files = clean.files;
    const noteTxt = U.describeNotes(clean.notes);
    const when = raw.savedAt ? new Date(raw.savedAt).toLocaleString('ar') : '';
    const before = STATE.files().length;
    UI.confirm({
      title: 'استعادة النسخة الاحتياطية؟',
      message: 'سيستبدل المشروع الحالي (' + before + ' ملف) بالنسخة المحفوظة' + (when ? ' بتاريخ ' + when : '') + ' (' + files.length + ' ملف).' + (noteTxt ? ' ملاحظات: ' + noteTxt + '.' : '') + ' المتابعة؟',
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
        const clean = U.sanitizeFiles(parsed);
        if (!clean) throw new Error('بنية غير معروفة (يُتوقع كائن {اسم الملف: المحتوى})');
        const files = clean.files;
        const noteTxt = U.describeNotes(clean.notes);
        /* بند 1.6: نسخة احتياطية قبل الاستبدال + تأكيد صريح — لا استبدال صامت */
        const current = STATE.files().length;
        const backupOk = await this._backupCurrent();
        UI.confirm({
          title: 'استيراد مشروع؟',
          message: 'سيستبدل المشروع الحالي (' + current + ' ملف) بمحتوى الملف المختار (' + files.length + ' ملف).'
            + (noteTxt ? ' تنبيه: ' + noteTxt + '.' : '')
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
          const content = await U.readText(file);
          if (content.length > KC.limits.maxFileChars) { skipped++; continue; }
          const r = STATE.addFile(STATE.uniqueName(this._reservedFor(file.name)), content, { tab: false });
          if (r.ok) n++; else skipped++;
        } catch (e) { skipped++; }
      }
      if (n) {
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
