/* =========================================================
 * kingCode — list.js
 * FILE_LIST: مستكشف المشروع — شجرة مجلدات وملفات بأيقونات ملونة،
 * تصفية بالاسم، وعمليات سريعة (تسمية/تنزيل/تكرار/حذف/ملف جديد داخل مجلد)
 * ========================================================= */
'use strict';

const FILE_LIST = {
  root: null,
  filterEl: null,
  filter: '',

  init() {
    this.root = U.$('#file-list');
    this.filterEl = U.$('#fileFilter');
    STATE.on('files:change', () => this.render());
    STATE.on('dirty', () => this.render());
    STATE.on('pref:collapsedFolders', () => this.render());
    if (this.filterEl) {
      this.filterEl.addEventListener('input', () => { this.filter = this.filterEl.value.trim().toLowerCase(); this.render(); });
      this.filterEl.addEventListener('keydown', e => {
        if (e.key === 'Escape' && this.filterEl.value) { e.preventDefault(); e.stopPropagation(); this.filterEl.value = ''; this.filter = ''; this.render(); }
        else if (e.key === 'ArrowDown') { const first = this.root.querySelector('.file-item'); if (first) { e.preventDefault(); first.focus(); } }
      });
    }
  },

  collapsed() { return new Set(STATE.uiPrefs().collapsedFolders || []); },

  toggleFolder(path, open) {
    const set = this.collapsed();
    const isOpen = !set.has(path);
    const wantOpen = open === undefined ? !isOpen : open;
    if (wantOpen === isOpen) return;
    if (wantOpen) set.delete(path); else set.add(path);
    STATE.setPref('collapsedFolders', Array.from(set));
  },

  /** صفوف الشجرة المسطّحة: مجلدات (أبجديًا) ثم ملفات (بترتيب الإنشاء) داخل كل مجلد */
  rows() {
    const files = STATE.files();
    const folders = STATE.folderPaths();
    const q = this.filter;
    const collapsed = this.collapsed();
    const rows = [];

    const fileMatches = f => !q || f.name.toLowerCase().includes(q);
    const folderMatches = path => !q || path.toLowerCase().includes(q) ||
      files.some(f => f.name.startsWith(path + '/') && fileMatches(f));

    const walk = (dir, depth) => {
      folders.filter(p => U.dirName(p) === dir && folderMatches(p)).forEach(p => {
        const open = q ? true : !collapsed.has(p);
        rows.push({ kind: 'folder', path: p, depth, open, count: STATE.filesInFolder(p).length });
        if (open) walk(p, depth + 1);
      });
      files.filter(f => U.dirName(f.name) === dir && fileMatches(f)).forEach(f => rows.push({ kind: 'file', f, depth }));
    };
    walk('', 0);
    return rows;
  },

  _actionButtons(defs, dataset) {
    const actions = document.createElement('span');
    actions.className = 'file-actions';
    defs.forEach(([glyph, label, action]) => {
      const b = document.createElement('button');
      b.className = 'btn btn-icon file-act';
      b.type = 'button';
      b.textContent = glyph;
      b.setAttribute('title', label);
      b.setAttribute('aria-label', label);
      b.dataset.action = action;
      Object.assign(b.dataset, dataset);
      actions.appendChild(b);
    });
    return actions;
  },

  render() {
    if (!this.root) return;
    const frag = document.createDocumentFragment();
    const files = STATE.files();
    const info = U.$('#storageInfo');
    if (info) info.textContent = files.length + ' ملف · ' + Math.max(1, Math.round(files.reduce((n, f) => n + f.content.length, 0) / 1024)) + 'KB';

    const rows = this.rows();
    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'file-empty';
      li.setAttribute('role', 'presentation');
      li.textContent = this.filter ? 'لا نتائج مطابقة' : 'لا توجد ملفات';
      frag.appendChild(li);
    }

    rows.forEach(r => {
      const li = document.createElement('li');
      li.tabIndex = 0; /* قابل للتركيز: أسهم لوحة المفاتيح تصل القائمة (a11y) */
      li.setAttribute('role', 'treeitem');
      li.setAttribute('aria-level', String(r.depth + 1));
      li.style.paddingInlineStart = (8 + r.depth * 14) + 'px';

      if (r.kind === 'folder') {
        li.className = 'file-item folder-item';
        li.dataset.kind = 'folder';
        li.dataset.path = r.path;
        li.setAttribute('aria-expanded', String(r.open));
        li.setAttribute('aria-label', 'مجلد ' + r.path);

        const ico = document.createElement('span');
        ico.className = 'file-ico folder-ico';
        ico.textContent = r.open ? '▾' : '▸';
        const name = document.createElement('span');
        name.className = 'file-name';
        name.dir = 'ltr';
        name.textContent = U.baseName(r.path) + '/';
        name.title = r.path + ' (' + r.count + ')';
        li.appendChild(ico);
        li.appendChild(name);
        li.appendChild(this._actionButtons([
          ['＋', 'ملف جديد داخل ' + r.path, 'new-file-in'],
          ['📁', 'مجلد فرعي داخل ' + r.path, 'new-folder-in'],
          ['✎', 'إعادة تسمية المجلد ' + r.path, 'rename-folder'],
          ['🗑', 'حذف المجلد ' + r.path, 'delete-folder']
        ], { path: r.path }));
      } else {
        const f = r.f;
        const lang = KC.langFor(f.name);
        li.className = 'file-item' + (f.id === STATE.data.activeId ? ' active' : '') + (STATE.isDirty(f.id) ? ' dirty' : '');
        li.dataset.kind = 'file';
        li.dataset.id = f.id;
        li.setAttribute('aria-selected', String(f.id === STATE.data.activeId));

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
        name.textContent = U.baseName(f.name);
        name.title = f.name;

        li.appendChild(ico);
        li.appendChild(name);
        li.appendChild(this._actionButtons([
          ['✎', 'إعادة تسمية ' + f.name, 'rename'],
          ['⤓', 'تنزيل ' + f.name, 'download'],
          ['⧉', 'تكرار ' + f.name, 'duplicate'],
          ['🗑', 'حذف ' + f.name, 'delete']
        ], { id: f.id }));
      }
      frag.appendChild(li);
    });

    /* حافظ على التركيز عبر إعادة الرسم (لوحة المفاتيح) */
    const focusedKey = document.activeElement && this.root.contains(document.activeElement)
      ? (document.activeElement.dataset.id || document.activeElement.dataset.path) : null;
    this.root.replaceChildren(frag);
    if (focusedKey) {
      const again = Array.from(this.root.querySelectorAll('.file-item')).find(el => (el.dataset.id || el.dataset.path) === focusedKey);
      if (again) again.focus();
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const list = U.$('#file-list');
  if (!list) return;

  /* الجوال/الآيباد: الدرج مؤقت — يُغلق بعد اختيار ملف؛ على الجوال يظهر المحرر */
  const closeSidebarOnMobile = () => {
    if (window.matchMedia(KC.ui.tabletQuery).matches) UI.setSidebar(false);
    if (window.matchMedia(KC.ui.mobileQuery).matches) UI.setMobileView('editor');
  };

  list.addEventListener('click', e => {
    const actBtn = e.target.closest('.file-act');
    if (actBtn) {
      e.stopPropagation();
      const id = actBtn.dataset.id, path = actBtn.dataset.path, a = actBtn.dataset.action;
      if (a === 'rename') FILES.renameUI(id);
      else if (a === 'download') FILES.download(id);
      else if (a === 'duplicate') FILES.duplicate(id);
      else if (a === 'delete') FILES.remove(id);
      else if (a === 'new-file-in') FILES.newFile(path);
      else if (a === 'new-folder-in') FILES.newFolder(path);
      else if (a === 'rename-folder') FILES.renameFolderUI(path);
      else if (a === 'delete-folder') FILES.removeFolderUI(path);
      return;
    }
    const li = e.target.closest('.file-item');
    if (!li) return;
    if (li.dataset.kind === 'folder') { FILE_LIST.toggleFolder(li.dataset.path); return; }
    if (li.dataset.id) { TABS.open(li.dataset.id, { activate: true }); closeSidebarOnMobile(); }
  });

  /* تنقل لوحة المفاتيح (نمط شجرة WAI-ARIA): ↑/↓ + Home/End، Enter/Space يفتح/يطوي، ←/→ حسب اتجاه الصفحة يطوي/يوسّع */
  list.addEventListener('keydown', e => {
    if (e.target.classList.contains('file-act')) return; /* أزرار الإجراءات تُدار بنفسها */
    const items = Array.from(list.querySelectorAll('.file-item'));
    if (!items.length) return;
    const li = e.target.closest('.file-item');
    const i = items.indexOf(li);
    const rtl = getComputedStyle(list).direction === 'rtl';
    const expandKey = rtl ? 'ArrowLeft' : 'ArrowRight';
    const collapseKey = rtl ? 'ArrowRight' : 'ArrowLeft';

    if ((e.key === 'Enter' || e.key === ' ') && li) {
      e.preventDefault();
      if (li.dataset.kind === 'folder') FILE_LIST.toggleFolder(li.dataset.path);
      else { TABS.open(li.dataset.id, { activate: true }); closeSidebarOnMobile(); }
      return;
    }
    if (li && li.dataset.kind === 'folder' && (e.key === expandKey || e.key === collapseKey)) {
      e.preventDefault();
      FILE_LIST.toggleFolder(li.dataset.path, e.key === expandKey);
      return;
    }

    let next = null;
    if (e.key === 'ArrowDown') next = items[(i + 1) % items.length];
    else if (e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    if (next) { e.preventDefault(); next.focus(); }
  });
});
