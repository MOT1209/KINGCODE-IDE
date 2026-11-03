/* =========================================================
 * kingCode — commands.js
 * سجل الأوامر المركزي وتعريف أوامر التطبيق: تستهلكه لوحة الأوامر والاختصارات.
 * الأوامر تستدعي FILES/PREVIEW/UI/TABS... داخل run فقط (تحميل كسول) فلا ترتيب تحميل بينها.
 * ========================================================= */
'use strict';

/**
 * سجل الأوامر المركزي — كل وحدة تحكم تستخدم نفس الواجهة.
 * الأمر: { id, label, hint, group, meta, run }
 */
const Commands = {
  _cmds: new Map(),

  add(cmd) {
    this._cmds.set(cmd.id, Object.assign({
      group: 'الأوامر', label: cmd.id, run: () => {}
    }, cmd));
  },

  run(id) {
    const cmd = this._cmds.get(id);
    if (!cmd) { console.warn('[kingCode] no command', id); return; }
    try { cmd.run(); } catch (e) { console.error('[kingCode] command failed', id, e); }
  },

  list() { return Array.from(this._cmds.values()); }
};

/* ---------- إدخال الأوامر المتاحة ---------- */

Commands.add({ id: 'ui.palette', label: 'لوحة الأوامر (بحث وفتح)', group: 'التحكم', hint: 'Ctrl+P', run: () => UI.openCommandPalette() });
Commands.add({ id: 'files.new', label: 'ملف جديد', group: 'ملفات', hint: '＋', run: () => FILES.newFile() });
Commands.add({ id: 'files.newFolder', label: 'مجلد جديد', group: 'ملفات', run: () => FILES.newFolder() });
Commands.add({ id: 'files.save', label: 'حفظ الملف الحالي', group: 'ملفات', hint: 'Ctrl+S', run: () => FILES.saveFile(STATE.data.activeId) });
Commands.add({ id: 'files.saveAll', label: 'حفظ كل الملفات', group: 'ملفات', run: async () => {
  STATE.files().forEach(f => STATE.markDirty(f.id, false));
  STATE.persist();
  if (await STATE.flush()) { UI.saveFlash(); UI.toast('تم حفظ كل الملفات 💾'); }
  else UI.toast('تعذّر الحفظ: مساحة التخزين ممتلئة — صدِّر المشروع الآن ⚠️', 'error', 6000);
}});
Commands.add({ id: 'files.rename', label: 'إعادة تسمية الملف الحالي', group: 'ملفات', run: () => FILES.renameUI(STATE.data.activeId) });
Commands.add({ id: 'files.download', label: 'تنزيل الملف الحالي', group: 'ملفات', run: () => FILES.download(STATE.data.activeId) });
Commands.add({ id: 'files.exportHTML', label: 'تصدير المشروع كملف HTML مستقل', group: 'ملفات', run: () => FILES.exportProjectHTML() });
Commands.add({ id: 'files.delete', label: 'حذف الملف الحالي', group: 'ملفات', run: () => FILES.remove(STATE.data.activeId) });
Commands.add({ id: 'files.restoreBackup', label: 'استعادة نسخة ما قبل الاستيراد', group: 'ملفات', run: () => FILES.restoreBackup() });

Commands.add({ id: 'preview.refresh', label: 'تحديث المعاينة', group: 'معاينة', hint: 'Ctrl+Enter', run: () => PREVIEW.refresh() });
Commands.add({ id: 'preview.console.toggle', label: 'فتح/إخفاء الكونسول', group: 'معاينة', hint: 'Shift+Enter',
  run: () => STATE.setSetting('consoleOpen', !STATE.settings().consoleOpen) });
Commands.add({ id: 'preview.console.clear', label: 'مسح سجل الكونسول', group: 'معاينة', run: () => UI.consoleClear() });

Commands.add({ id: 'ui.preview.toggle', label: 'إظهار/إخفاء المعاينة', group: 'بالشاشة', run: () => UI.togglePreview() });
Commands.add({ id: 'ui.sidebar.toggle', label: 'إظهار/إخفاء الشريط الجانبي', group: 'بالشاشة', run: () => UI.toggleSidebar() });
Commands.add({ id: 'ui.theme.toggle', label: 'تبديل الوضع الداكن/الفاتح', group: 'بالشاشة', run: () => UI.toggleUiTheme() });
Commands.add({ id: 'ui.settings', label: 'فتح الإعدادات', group: 'بالشاشة', run: () => UI.openSettings() });
Commands.add({ id: 'editor.zoomIn', label: 'تكبير خط المحرر', group: 'محرر', hint: 'Ctrl+=', run: () => {
  const s = Math.min(30, STATE.settings().fontSize + 1); STATE.setSetting('fontSize', s);
}});
Commands.add({ id: 'editor.zoomOut', label: 'تصغير خط المحرر', group: 'محرر', hint: 'Ctrl+-', run: () => {
  const s = Math.max(10, STATE.settings().fontSize - 1); STATE.setSetting('fontSize', s);
}});
Commands.add({ id: 'tabs.close', label: 'إغلاق التبويب الحالي', group: 'تبويبات', run: () => TABS.close(STATE.data.activeId) });
Commands.add({ id: 'tabs.closeAll', label: 'إغلاق كل التبويبات', group: 'تبويبات', run: () => TABS.closeAll() });
Commands.add({ id: 'tabs.next', label: 'التبويب التالي', group: 'تبويبات', hint: 'Alt+→', run: () => TABS.cycle(1) });
Commands.add({ id: 'tabs.prev', label: 'التبويب السابق', group: 'تبويبات', hint: 'Alt+←', run: () => TABS.cycle(-1) });
Commands.add({ id: 'app.install', label: 'تثبيت kingCode كتطبيق', group: 'نظام', run: () => UI.promptInstall() });
Commands.add({ id: 'app.update', label: 'التحقق من تحديثات kingCode', group: 'نظام', run: () => UI.checkForUpdate() });
Commands.add({ id: 'app.applyUpdate', label: 'تطبيق التحديث الجاهز وإعادة التحميل', group: 'نظام', run: () => APP.applyUpdate() });
