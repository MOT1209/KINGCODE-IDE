/* =========================================================
 * kingCode — tabs.js
 * التبويبات المفتوحة: عرض/تحديد/إغلاق + نقطة التعديل
 * ========================================================= */
'use strict';

const TABS = {
  bar: null,

  init() {
    this.bar = U.$('#tab-container');
    STATE.on('files:change', () => this.render());
    STATE.on('dirty', () => this.render());
    STATE.on('active:change', () => this.render());
  },

  open(id, { activate = true } = {}) {
    const f = STATE.file(id);
    if (!f) return;
    if (STATE.data.tabs.length >= KC.limits.tabsMax && !STATE.data.tabs.includes(id)) {
      STATE.data.tabs.shift();
    }
    if (!STATE.data.tabs.includes(id)) STATE.data.tabs.push(id);
    STATE.persist();
    this.render();
    if (activate) STATE.setActive(id);
  },

  close(id) {
    const tabs = STATE.data.tabs;
    const idx = tabs.indexOf(id);
    if (idx === -1) return;
    const wasActive = STATE.data.activeId === id;
    tabs.splice(idx, 1);
    STATE.persist();

    if (wasActive) {
      const next = tabs[idx] || tabs[idx - 1] ||
        (STATE.data.files[0] && STATE.data.files[0].id) || null;
      if (next) STATE.setActive(next);
      else { STATE.data.activeId = null; STATE.persist(); STATE.emit('active:change', null); }
    }
    this.render();
  },

  cycle(dir = 1) {
    const tabs = STATE.data.tabs;
    if (tabs.length < 2) return;
    const i = tabs.indexOf(STATE.data.activeId);
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    STATE.setActive(next);
  },

  closeAll() {
    STATE.data.tabs = STATE.data.tabs.filter(t => t === STATE.data.activeId);
    STATE.persist();
    this.render();
  },

  render() {
    if (!this.bar) return;
    const frag = document.createDocumentFragment();
    const activeId = STATE.data.activeId;

    STATE.data.tabs.forEach(id => {
      const f = STATE.file(id);
      if (!f) return;
      const li = document.createElement('div');
      li.className = 'tab' + (id === activeId ? ' active' : '');
      li.setAttribute('role', 'tab');
      li.setAttribute('aria-selected', String(id === activeId));
      li.dataset.id = id;
      if (STATE.isDirty(id)) li.classList.add('dirty');

      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = f.name;
      const ext = KC.extOf(f.name);
      if (ext) { label.style.setProperty('--ext-color', (KC.langFor(f.name) || {}).color || '#9aa4b2'); label.classList.add('has-ext'); }

      const x = document.createElement('button');
      x.className = 'tab-close';
      x.setAttribute('aria-label', 'إغلاق ' + f.name);
      x.textContent = '✕';

      li.appendChild(label);
      li.appendChild(x);
      frag.appendChild(li);
    });

    this.bar.replaceChildren(frag);
  }
};

/* تفويض نقر الكل مرة واحدة */
document.addEventListener('DOMContentLoaded', () => {
  const bar = U.$('#tab-container');
  if (!bar) return;
  bar.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab || !tab.dataset.id) return;
    if (e.target.classList.contains('tab-close')) { TABS.close(tab.dataset.id); return; }
    STATE.setActive(tab.dataset.id);
  });

  /* زر الفأرة الأوسط يغلق (index 1) */
  bar.addEventListener('auxclick', e => {
    if (e.button !== 1) return;
    const tab = e.target.closest('.tab');
    if (tab) TABS.close(tab.dataset.id);
  });

  /* المزدوج اعتمد على إعادة التسمية */
  bar.addEventListener('dblclick', e => {
    const tab = e.target.closest('.tab');
    if (tab) FILES.renameUI(tab.dataset.id);
  });
});
