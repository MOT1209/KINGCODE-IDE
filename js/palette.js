/* =========================================================
 * kingCode — palette.js
 * لوحة الأوامر (Ctrl+P): بحث في ملفات المشروع والأوامر (واجهة WAI-ARIA: option/aria-selected)
 * ========================================================= */
'use strict';

/* ---------- لوحة الأوامر (Command Palette) ---------- */

const PALETTE = {
  root: null, input: null, results: null,
  items: [], sel: 0,

  init() {
    this.root = U.$('#command-palette');
    this.input = U.$('#cmd-input');
    this.results = U.$('#cmd-results');

    this.input.addEventListener('input', () => this.refresh());
    this.input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); this.exec(); }
      else if (e.key === 'Escape') { e.preventDefault(); UI.closeModal('command-palette'); }
    });

    this.results.addEventListener('click', e => {
      const li = e.target.closest('li');
      if (li && li.dataset.index != null) {
        this.sel = +li.dataset.index;
        this.exec();
      }
    });
  },

  open() {
    this.input.value = '';
    this.refresh();
    UI.openModal('command-palette');
    setTimeout(() => this.input.focus(), 60);
  },

  close() { UI.closeModal('command-palette'); },

  /** مصادر النتائج: أوامر + ملفات المشروع */
  collect(q) {
    q = (q || '').trim().toLowerCase();
    const items = [];

    /* ملفات المشروع */
    STATE.files().forEach(f => {
      const nl = f.name.toLowerCase();
      if (q && !nl.includes(q)) return;
      items.push({
        kind: 'file', label: f.name, sub: KC.langFor(f.name).label, icon: '📄',
        run: () => { TABS.open(f.id); }
      });
    });

    /* الأوامر */
    Commands.list().forEach(c => {
      if (q && !c.label.toLowerCase().includes(q)) return;
      items.push({ kind: 'cmd', label: c.label, sub: c.group, meta: c.hint, icon: '⚡', run: c.run });
    });

    return items.slice(0, 60);
  },

  refresh() {
    this.items = this.collect(this.input.value);
    this.sel = 0;
    const frag = document.createDocumentFragment();

    if (!this.items.length) {
      const li = document.createElement('li');
      li.className = 'cmd-item empty';
      li.textContent = 'لا توجد نتائج مطابقة';
      frag.appendChild(li);
    } else {
      this.items.forEach((it, i) => {
        const li = document.createElement('li');
        li.className = 'cmd-item' + (i === this.sel ? ' selected' : '');
        li.dataset.index = i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === this.sel));
        li.innerHTML = `
          <span class="cmd-ico">${it.icon}</span>
          <span class="cmd-label" dir="auto">${U.escapeHtml(it.label)}</span>
          <span class="cmd-sub">${U.escapeHtml(it.sub || '')}</span>
          <span class="cmd-meta" dir="ltr">${U.escapeHtml(it.meta || '')}</span>`;
        frag.appendChild(li);
      });
    }
    this.results.replaceChildren(frag);
    const selEl = U.$('li.selected', this.results);
    if (selEl) selEl.scrollIntoView({ block: 'nearest' });
  },

  move(dir) {
    if (!this.items.length) return;
    this.sel = (this.sel + dir + this.items.length) % this.items.length;
    U.$$('li.cmd-item', this.results).forEach((li, i) => {
      li.classList.toggle('selected', i === this.sel);
      li.setAttribute('aria-selected', String(i === this.sel));
    });
    const selEl = U.$('li.selected', this.results);
    if (selEl) selEl.scrollIntoView({ block: 'nearest' });
  },

  exec() {
    const it = this.items[this.sel];
    if (!it) return;
    this.close();
    it.run();
  }
};
