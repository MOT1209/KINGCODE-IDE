/* =========================================================
 * kingCode — ui.js (Command Palette + Commands)
 * القلب العصبي: لوحة أوامر بحثية وسجل أوامر مرجعي
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
Commands.add({ id: 'files.save', label: 'حفظ الملف الحالي', group: 'ملفات', hint: 'Ctrl+S', run: () => FILES.saveFile(STATE.data.activeId) });
Commands.add({ id: 'files.saveAll', label: 'حفظ كل الملفات', group: 'ملفات', run: () => {
  STATE.files().forEach(f => STATE.markDirty(f.id, false));
  STATE.persist();
  if (STATE.flush()) { UI.saveFlash(); UI.toast('تم حفظ كل الملفات 💾'); }
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

    return items.slice(0, 14);
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

/* =========================================================
 * UI — العناصر التفاعلية: toasts، dialogs، toggles، الحالة
 * ========================================================= */

const UI = {
  _lastToast: null,
  _confirmCb: null,
  _promptCb: null,
  _focusBeforeModal: null,
  _trapTarget: null,
  _trapHandler: null,
  _swUpdate: null,

  init() {
    /* أزرار الشريط العلوي/الأدوات */
    U.$('#btnPalette')?.addEventListener('click', () => UI.openCommandPalette());
    U.$('#btnSettings')?.addEventListener('click', () => UI.openSettings());
    U.$('#btnThemeToggle')?.addEventListener('click', () => UI.toggleUiTheme());
    U.$('#btnSplitPreview')?.addEventListener('click', () => UI.togglePreview());
    U.$('#btnConsoleToggle')?.addEventListener('click', () => UI.toggleConsole());
    U.$('#btnNewFile')?.addEventListener('click', () => FILES.newFile());
    U.$('#btnImportFile')?.addEventListener('click', () => FILES.importFiles());
    U.$('#btnExport')?.addEventListener('click', () => FILES.exportProject());
    U.$('#btnImport')?.addEventListener('click', () => FILES.importProject());

    /* أزرار نوافذ التأكيد والإدخال */
    U.$('#prompt-ok')?.addEventListener('click', () => UI.submitPrompt());
    U.$('#prompt-cancel')?.addEventListener('click', () => UI.cancelPrompt());
    U.$('#prompt-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); UI.submitPrompt(); }
    });

    U.$('#confirm-ok')?.addEventListener('click', () => {
      const cb = UI._confirmCb;
      UI._confirmCb = null;
      UI.closeModal('confirm-modal');
      if (cb) cb(true);
    });
    U.$('#confirm-cancel')?.addEventListener('click', () => UI.cancelConfirm());

    /* زر التثبيت (PWA) */
    U.$('#btnInstall')?.addEventListener('click', () => this.promptInstall());
    window.addEventListener('beforeinstallprompt', e => this.beforeinstall(e));
    window.addEventListener('appinstalled', () => {
      this._deferredPrompt = null;
      U.$('#btnInstall')?.classList.add('hidden');
      UI.toast('✅ تم تثبيت kingCode على جهازك');
    });

    /* نقر خلف الطبقات يغلق أي modal */
    document.addEventListener('click', e => {
      for (const id of ['command-palette', 'settings-modal', 'confirm-modal', 'prompt-modal']) {
        if (e.target.id === id) {
          if (id === 'prompt-modal') this.cancelPrompt();
          else if (id === 'confirm-modal') this.cancelConfirm();
          else this.closeModal(id);
          return;
        }
      }
    });

    /* فئات حالة الجسم تتبّع الإعدادات الحية */
    STATE.on('settings:showPreview', v => document.body.classList.toggle('preview-hidden', !v));
    STATE.on('settings:consoleOpen', v => document.body.classList.toggle('console-hidden', !v));
    document.body.classList.toggle('preview-hidden', !STATE.settings().showPreview);
    document.body.classList.toggle('console-hidden', !STATE.settings().consoleOpen);

    /* لوحة الإعدادات */
    const th = U.$('#theme-select');
    th.value = STATE.settings().theme;
    th.addEventListener('change', e => STATE.setSetting('theme', e.target.value));

    const ut = U.$('#ui-theme');
    ut.value = STATE.settings().uiTheme;
    ut.addEventListener('change', e => STATE.setSetting('uiTheme', e.target.value));

    const fs = U.$('#font-size-slider');
    fs.value = STATE.settings().fontSize;
    U.$('#font-size-value').textContent = STATE.settings().fontSize + 'px';
    fs.addEventListener('input', e => {
      const v = +e.target.value;
      U.$('#font-size-value').textContent = v + 'px';
      STATE.setSetting('fontSize', v);
    });

    const ts = U.$('#tab-size');
    ts.value = STATE.settings().tabSize;
    ts.addEventListener('change', e => {
      const v = U.clamp(parseInt(e.target.value, 10) || 2, 1, 8);
      e.target.value = v;
      STATE.setSetting('tabSize', v);
    });

    const bindToggle = (id, key) => {
      const el = U.$('#' + id);
      el.checked = STATE.settings()[key];
      el.addEventListener('change', e => STATE.setSetting(key, e.target.checked));
    };
    bindToggle('wrap-lines', 'wrapLines');
    bindToggle('show-line-numbers', 'showLineNumbers');
    bindToggle('auto-save', 'autoSave');
    bindToggle('auto-preview', 'autoPreview');

    /* لوحة مفاتيح عامة لكل التطبيق */
    document.addEventListener('keydown', e => {
      /* Escape: أقرب نافذة مفتوحة تُغلق */
      if (e.key === 'Escape') {
        for (const id of ['prompt-modal', 'confirm-modal', 'settings-modal']) {
          if (this.isModalOpen(id)) {
            e.preventDefault();
            if (id === 'prompt-modal') this.cancelPrompt();
            else if (id === 'confirm-modal') this.cancelConfirm();
            else this.closeModal(id);
            return;
          }
        }
        if (this.isModalOpen('command-palette')) { e.preventDefault(); PALETTE.close(); }
        return;
      }

      /* Alt+أسهم لتنقّل التبويبات خارج المحرر أيضًا (RTL-aware: يسار=التالي في RTL) */
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        /* في RTL: ArrowLeft يتحرك للأمام (التالي)، ArrowRight للخلف (السابق) */
        const dir = e.key === 'ArrowLeft' ? 1 : -1;
        TABS.cycle(dir);
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); Commands.run('files.save'); }
      else if (k === 'p') { e.preventDefault(); Commands.run('ui.palette'); }
      else if (k === 'd') { e.preventDefault(); Commands.run('preview.console.toggle'); }
      else if (k === 'enter') { e.preventDefault(); Commands.run('preview.refresh'); }
      else if (k === 'o') { e.preventDefault(); FILES.importFiles(); }
    });

    /* نتائج الحفظ + تفريغ الحفظ المعلّق عند مغادرة الصفحة (يمنع ضياع آخر ≤250ms من التعديل) */
    STATE.on('persisted', res => UI.onPersisted(res));
    window.addEventListener('pagehide', () => STATE.flush());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') STATE.flush(); });

    /* الحفظ بعد ذروة الإنعاش */
    window.addEventListener('beforeunload', e => {
      if (!STATE.settings().autoSave && STATE.data.dirty.size) {
        e.preventDefault();
        e.returnValue = 'توجد ملفات غير محفوظة';
        return e.returnValue;
      }
    });

    /* اختراع مفاتيح الحالة الموبيل */
    UI.setupResponsive();

    /* الاتصال/الانقطاع */
    UI.applyNetStatus();
    window.addEventListener('online', UI.applyNetStatus);
    window.addEventListener('offline', UI.applyNetStatus);
  },

  /* ---------- المحرمات المتعددة ---------- */

  openModal(id) {
    const el = U.$('#' + id);
    if (!el) return;
    this._focusBeforeModal = document.activeElement;
    el.style.display = 'flex';
    el.setAttribute('aria-hidden', 'false');
    /* الاحتواء: aria-modal=true مُعلن، فالعملية الإلزامية أن لا يهرب Tab إلى الخلفية */
    this._trapFocus(el);
    const focusable = el.querySelector('input, button, select');
    if (focusable) setTimeout(() => focusable.focus(), 40);
  },

  _trapFocus(el) {
    /* نظافة منتقلٍ سابق إن وُجد، ثم ربط قفل الجدولة داخل النافذة */
    this._untrapFocus();
    this._trapTarget = el;
    this._trapHandler = e => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(el.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(x => !x.closest('[hidden]'));
      if (!focusables.length) { e.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = el.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first) { e.preventDefault(); last.focus(); }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', this._trapHandler);
  },

  _untrapFocus() {
    if (this._trapTarget && this._trapHandler) {
      this._trapTarget.removeEventListener('keydown', this._trapHandler);
    }
    this._trapTarget = null;
    this._trapHandler = null;
  },

  closeModal(id) {
    const el = U.$('#' + id);
    if (!el) return;
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    if (this._trapTarget === el) this._untrapFocus();
    if (this._focusBeforeModal && this._focusBeforeModal.focus) {
      this._focusBeforeModal.focus();
      this._focusBeforeModal = null;
    }
  },

  isModalOpen(id) {
    const el = U.$('#' + id);
    return !!el && el.style.display !== 'none' && el.style.display !== '';
  },

  openCommandPalette() { PALETTE.open(); },

  /* ---------- Toasts ---------- */

  toast(msg, type = 'info', dur = KC.timing.toast) {
    const root = U.$('#toast-container');
    if (!root) return;
    while (root.children.length >= 4) root.firstElementChild.remove();
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.setAttribute('role', 'status');
    t.textContent = msg;
    root.appendChild(t);
    U.raf(() => t.classList.add('show'));
    this._lastToast = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 320);
    }, dur);
    t.addEventListener('click', () => t.remove());
  },

  /* ---------- Console المعاينة ---------- */

  consoleAppend(level, parts) {
    const box = U.$('#console-output');
    if (!box) return;
    if (level === 'system') this.consoleClear();
    const arr = typeof parts === 'string' ? [parts] : (Array.isArray(parts) ? parts : [String(parts)]);
    while (box.children.length >= KC.limits.consoleMax) box.firstElementChild.remove();

    const row = document.createElement('div');
    row.className = 'console-item lvl-' + level;

    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const time = document.createElement('span');
    time.className = 'console-time';
    time.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());

    const txt = document.createElement('span');
    txt.className = 'console-text';
    txt.textContent = arr.map(String).join(' ');

    row.appendChild(time);
    row.appendChild(txt);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  },

  consoleClear() {
    const box = U.$('#console-output');
    if (box) box.replaceChildren();
  },

  /* ---------- المؤشر/الملف/الحفظ ---------- */

  updateCursor(pos) {
    const el = U.$('#statusPos');
    if (el && pos) el.textContent = 'سطر: ' + (pos.line + 1) + ' | عمود: ' + (pos.ch + 1);
  },

  updateStatusFile() {
    const f = STATE.file(STATE.data.activeId);
    U.$('#statusFile').textContent = f ? f.name : 'Untitled';
    U.$('#statusLang').textContent = f ? KC.langFor(f.name).label : '—';
  },

  /** نتيجة كل كتابة فعلية للتخزين: النجاح يومض «حُفظ»، والفشل حالة دائمة + تنبيه متكرر (كل 10 ث كحد أدنى) */
  onPersisted(res) {
    const el = U.$('#saveIndicator');
    if (!el) return;
    if (res && res.ok === false) {
      el.textContent = '⚠ لم يُحفظ — التخزين ممتلئ';
      el.classList.remove('saved');
      el.classList.add('failed');
      const now = Date.now();
      if (!this._failToastAt || now - this._failToastAt > 10000) {
        this._failToastAt = now;
        UI.toast('مساحة التخزين ممتلئة — تعديلاتك الأخيرة غير محفوظة. صدِّر المشروع الآن ⚠️', 'error', 7000);
      }
      return;
    }
    if (el.classList.contains('failed')) { el.classList.remove('failed'); el.textContent = '💾 جاهز'; }
    if (STATE._flash) { STATE._flash = false; this.saveFlash(); }
  },

  saveFlash(kind) {
    const el = U.$('#saveIndicator');
    if (!el || el.classList.contains('failed')) return;
    el.textContent = '✓ حُفظ';
    el.classList.add('saved');
    clearTimeout(this._sv);
    this._sv = setTimeout(() => {
      el.textContent = '💾 جاهز';
      el.classList.remove('saved');
    }, 1300);
  },

  /* ---------- الإعدادات ---------- */

  openSettings() {
    const st = STATE.settings();
    U.$('#theme-select').value = st.theme;
    U.$('#ui-theme').value = st.uiTheme;
    U.$('#font-size-slider').value = st.fontSize;
    U.$('#font-size-value').textContent = st.fontSize + 'px';
    U.$('#tab-size').value = st.tabSize;
    U.$('#wrap-lines').checked = st.wrapLines;
    U.$('#show-line-numbers').checked = st.showLineNumbers;
    U.$('#auto-save').checked = st.autoSave;
    U.$('#auto-preview').checked = st.autoPreview;
    this.openModal('settings-modal');
  },

  toggleUiTheme() {
    const next = STATE.settings().uiTheme === 'light' ? 'dark' : 'light';
    STATE.setSetting('uiTheme', next);
  },

  togglePreview() {
    const v = !STATE.settings().showPreview;
    STATE.setSetting('showPreview', v);
  },

  toggleConsole() {
    const v = !STATE.settings().consoleOpen;
    STATE.setSetting('consoleOpen', v);
  },

  toggleSidebar() {
    this.setSidebar(!STATE.uiPrefs().sidebarOpen);
  },

  setSidebar(open) {
    const el = U.$('.app-container');
    /* حماية من الحلقة: اكتب فقط عند التغيير الفعلي */
    if (el && el.classList.contains('sidebar-open') !== !!open) {
      el.classList.toggle('sidebar-open', !!open);
    }
    if (STATE.uiPrefs().sidebarOpen !== open) STATE.setPref('sidebarOpen', open);
  },

  /* ---------- محاور الاستجابة (الموبايل/الآيباد) ---------- */

  setupResponsive() {
    const applySidebar = open => this.setSidebar(open);
    STATE.on('pref:sidebarOpen', applySidebar);

    const m1 = window.matchMedia(KC.ui.mobileQuery);
    const m2 = window.matchMedia(KC.ui.tabletQuery);
    const onChange = () => {
      const isMobile = m1.matches;
      const isTablet = m2.matches;
      document.body.classList.toggle('view-mobile', isMobile);
      document.body.classList.toggle('view-tablet', isTablet && !isMobile);
      document.body.classList.toggle('view-desktop', !m2.matches);
      /* الموبايل: أغلق الشريط الجانبي تلقائيًا */
      if (isMobile && STATE.uiPrefs().sidebarOpen) this.setSidebar(false);
    };
    m1.addEventListener?.('change', onChange);
    m2.addEventListener?.('change', onChange);
    onChange();

    /* زر هامبرغر عائم (الأجهزة الصغيرة والمتوسطة) */
    const burger = document.createElement('button');
    burger.className = 'btn btn-icon edge-toggle';
    burger.innerHTML = '☰';
    burger.setAttribute('title', 'الشريط الجانبي');
    burger.addEventListener('click', () => UI.toggleSidebar());
    U.$('.app-container').prepend(burger);

    /* أزرار سرعة على موبايل */
    const bar = document.createElement('div');
    bar.className = 'mobile-quickbar';
    bar.innerHTML =
      '<button class="btn btn-icon" title="الشريط الجانبي">☰</button>' +
      '<button class="btn btn-icon" title="الملف السابق">⬅</button>' +
      '<button class="btn btn-icon" title="الملف التالي">➡</button>' +
      '<button class="btn btn-icon" title="الإعدادات">⚙️</button>';
    const [b1, b2, b3, b4] = bar.children;
    b1.addEventListener('click', () => UI.toggleSidebar());
    b2.addEventListener('click', () => TABS.cycle(-1));
    b3.addEventListener('click', () => TABS.cycle(1));
    b4.addEventListener('click', () => UI.openSettings());
    U.$('.app-container').appendChild(bar);

    /* مقبض تقسيم عرض المعاينة (سطح المكتب فقط) */
    const split = U.$('#mainSplit');
    const splitter = U.$('#splitter');
    const pane = U.$('#preview-container');
    if (split && splitter && pane) {
      splitter.addEventListener('pointerdown', e => {
        if (!document.body.classList.contains('view-desktop')) return;
        e.preventDefault();
        try { splitter.setPointerCapture(e.pointerId); } catch (_) {}
        const rect = split.getBoundingClientRect();
        document.body.classList.add('resizing');
        const move = ev => {
          const w = U.clamp(ev.clientX - rect.left, KC.ui.previewMin, rect.width * KC.ui.previewMaxRatio);
          pane.style.flexBasis = Math.round(w) + 'px';
        };
        const up = () => {
          document.body.classList.remove('resizing');
          splitter.removeEventListener('pointermove', move);
          splitter.removeEventListener('pointerup', up);
          splitter.removeEventListener('pointercancel', up);
        };
        splitter.addEventListener('pointermove', move);
        splitter.addEventListener('pointerup', up);
        splitter.addEventListener('pointercancel', up);
      });
    }
  },

  /* ---------- شبكة/تركيب ---------- */

  applyNetStatus() {
    const el = U.$('#netIndicator');
    if (!el) return;
    const online = navigator.onLine;
    el.classList.toggle('online', online);
    el.classList.toggle('offline', !online);
    el.textContent = online ? '● متصل' : '● أُوفلاين';
  },

  /* سجل التثبيت كـ PWA */
  _deferredPrompt: null,
  beforeinstall(e) {
    e.preventDefault();
    this._deferredPrompt = e;
    const btn = U.$('#btnInstall');
    btn?.classList.remove('hidden');
  },
  promptInstall() {
    const p = this._deferredPrompt;
    if (!p || typeof p.prompt !== 'function') {
      UI.toast('التثبيت متاح من قائمة المتصفح «تثبيت التطبيق» 🖥', 'warn');
      return;
    }
    p.prompt();
    p.userChoice.then(() => { this._deferredPrompt = null; });
  },
  checkForUpdate() { APP.checkForUpdate(true); },

  /* ---------- dialogs للأقوال ---------- */

  confirm(opts, cb) {
    U.$('#confirm-title').textContent = opts.title || 'تأكيد';
    U.$('#confirm-msg').textContent = opts.message || '';
    this._confirmCb = cb;
    const ok = U.$('#confirm-ok');
    ok.textContent = opts.okLabel || 'موافق';
    ok.classList.toggle('danger', !!opts.danger);
    this.openModal('confirm-modal');
  },

  prompt(opts, cb) {
    U.$('#prompt-title').textContent = opts.title || 'اكتب';
    const inp = U.$('#prompt-input');
    inp.value = opts.value || '';
    inp.placeholder = opts.placeholder || '';
    this._promptCb = cb;
    this.openModal('prompt-modal');
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
  },

  cancelPrompt() { this._promptCb = null; this.closeModal('prompt-modal'); },

  cancelConfirm() {
    const cb = this._confirmCb;
    this._confirmCb = null;
    this.closeModal('confirm-modal');
    if (cb) cb(false);
  },
  submitPrompt() {
    const v = U.$('#prompt-input').value.trim();
    this.closeModal('prompt-modal');
    if (this._promptCb) { const cb = this._promptCb; this._promptCb = null; cb(v); }
  }
};

