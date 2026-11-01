/* =========================================================
 * kingCode — list.js
 * FILE_LIST: قائمة ملفات المشروع بأيقونات ملونة
 * وعمليات سريعة (تسمية/تنزيل/تكرار/حذف)
 * ========================================================= */
'use strict';

const FILE_LIST = {
  root: null,

  init() {
    this.root = U.$('#file-list');
    STATE.on('files:change', () => this.render());
    STATE.on('dirty', () => this.render());
  },

  render() {
    if (!this.root) return;
    const frag = document.createDocumentFragment();
    const files = STATE.files();
    const info = U.$('#storageInfo');
    if (info) info.textContent = files.length + ' ملف · ' + Math.max(1, Math.round(U.storage.usage() / 1024)) + 'KB';

    files.forEach(f => {
      const li = document.createElement('li');
      li.className = 'file-item' + (f.id === STATE.data.activeId ? ' active' : '') +
        (STATE.isDirty(f.id) ? ' dirty' : '');
      li.dataset.id = f.id;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(f.id === STATE.data.activeId));

      const lang = KC.langFor(f.name);

      /* أيقونة الامتداد الملوّنة */
      const ext = KC.extOf(f.name);
      const ico = document.createElement('span');
      ico.className = 'file-ico';
      ico.style.background = lang.color;
      ico.textContent = ({
        html: 'H', htm: 'H', css: '#', js: 'JS', mjs: 'JS', json: '{}',
        md: 'M', py: 'PY', sql: 'Q', yml: 'Y', yaml: 'Y', xml: '<>', svg: '<>',
        txt: 'T', markdown: 'M'
      })[ext] || '•';

      const name = document.createElement('span');
      name.className = 'file-name';
      name.dir = 'ltr';
      name.textContent = f.name;

      /* أزرار إجراءات سريعة */
      const actions = document.createElement('span');
      actions.className = 'file-actions';
      const acts = [
        ['✎', 'إعادة تسمية', 'rename'],
        ['⤓', 'تنزيل', 'download'],
        ['⧉', 'مكرر', 'duplicate'],
        ['🗑', 'حذف', 'delete']
      ];
      acts.forEach(([glyph, title, action]) => {
        const b = document.createElement('button');
        b.className = 'btn btn-icon file-act';
        b.textContent = glyph;
        b.setAttribute('title', title + ' — ' + f.name);
        b.dataset.action = action;
        b.dataset.id = f.id;
        actions.appendChild(b);
      });

      li.appendChild(ico);
      li.appendChild(name);
      li.appendChild(actions);
      frag.appendChild(li);
    });

    this.root.replaceChildren(frag);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const list = U.$('#file-list');
  if (!list) return;

  list.addEventListener('click', e => {
    const actBtn = e.target.closest('.file-act');
    if (actBtn) {
      e.stopPropagation();
      const id = actBtn.dataset.id, a = actBtn.dataset.action;
      if (a === 'rename') FILES.renameUI(id);
      else if (a === 'download') FILES.download(id);
      else if (a === 'duplicate') FILES.duplicate(id);
      else if (a === 'delete') FILES.remove(id);
      return;
    }
    const li = e.target.closest('.file-item');
    if (li && li.dataset.id) {
      TABS.open(li.dataset.id, { activate: true });
      /* على الشاشات الصغيرة: نغلق الشريط الجانبي بعد الاختيار */
      if (window.matchMedia(KC.ui.mobileQuery).matches) UI.setSidebar(false);
    }
  });
});
