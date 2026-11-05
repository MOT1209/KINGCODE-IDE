/* =========================================================
 * kingCode — app.js
 * المنسق الرئيسي: الإقلاع، Service Worker، أفعال URL
 * ========================================================= */
'use strict';

const APP = {
  swReg: null,

  async boot() {
    /* 1) الحالة (تخزين غير متزامن: IndexedDB أو localStorage احتياطًا) */
    await STORE.init();
    const snap = await STORE.load();
    const had = STATE.hydrate(snap);
    if (!had) STATE.bootstrapDefaults();
    else if (snap && (snap._fromJournal || snap._migrated)) STATE.persist(STATE.ALL); /* يثبّت الترحيل من localStorage/سجل الطوارئ */

    /* 2) الوحدات */
    FILE_LIST.init();
    TABS.init();
    PALETTE.init();
    UI.init();
    HUB.init();
    EXT_HOST.init();

    /* 3) المحرر والمعاينة */
    EDITOR.init(U.$('#editor-container'));
    PREVIEW.init();
    PREVIEW.build();

    /* 4) المظهر العام */
    document.body.dataset.theme = STATE.settings().uiTheme;
    APP.updateMetaTheme();
    STATE.on('settings:uiTheme', () => {
      document.body.dataset.theme = STATE.settings().uiTheme;
      APP.updateMetaTheme();
    });

    /* 5) الشريط الجانبي والقوائم */
    FILE_LIST.render();
    TABS.render();

    /* 6) حالات التبديل النشط: الحالة + الحالة الفارغة للمحرر */
    STATE.on('active:change', id => {
      UI.updateStatusFile();
      const empty = U.$('#editorEmpty');
      if (empty) empty.classList.toggle('hidden', !!id);
    });

    /* 7) الملف النشط عند البدء */
    if (STATE.data.activeId) {
      if (!STATE.data.tabs.includes(STATE.data.activeId)) {
        STATE.data.tabs.unshift(STATE.data.activeId);
      }
      STATE.setActive(STATE.data.activeId);
      EDITOR.open(STATE.data.activeId);
      UI.updateStatusFile();
      UI.updateCursor(EDITOR.cm.getCursor());
      U.$('#editorEmpty')?.classList.add('hidden');
    }

    /* 8) مقبض تنقيح واحد (kc) للاختبارات — لا أسماء عالمية إضافية بعد إزالة onclick المضمّن */
    window.kc = { KC, STATE, EDITOR, FILES, TABS, PREVIEW, FILE_LIST, UI, PALETTE, Commands, APP, BRIDGE, HUB, EXT_HOST };

    /* 9) Service Worker */
    APP.registerSw();
    /* فحص التحديثات التلقائي بعد registration */
    APP.checkForUpdate();
  },

  updateMetaTheme() {
    const meta = U.$('#metaTheme');
    if (!meta) return;
    const v = getComputedStyle(document.body).getPropertyValue('--statusbar-bg').trim();
    meta.content = v || (STATE.settings().uiTheme === 'dark' ? '#12253a' : '#1d3152');
  },

  _updating: false,
  updateReady: false,

  registerSw() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
      this.swReg = reg;
      const watch = nw => {
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            this.updateReady = true;
            UI.toast('🆕 تحديث kingCode جاهز — نفّذ «تطبيق التحديث» من لوحة الأوامر (Ctrl+P) أو أعد فتح التطبيق', 'info', 9000);
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) { this.updateReady = true; }
      reg.addEventListener?.('updatefound', () => watch(reg.installing));
    }).catch(err => console.warn('[kingCode] SW register failed:', err));

    /* إعادة التحميل فقط بطلب المستخدم الصريح — لا مقاطعة للكتابة */
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!this._updating) return;
      location.reload();
    });
  },

  /** يطبّق التحديث الجاهز: يحفظ أولًا ثم يفعّل الـ SW الجديد ويعيد التحميل */
  async applyUpdate() {
    const reg = this.swReg;
    if (!reg || !reg.waiting) { UI.toast('لا يوجد تحديث جاهز حاليًا', 'info'); return; }
    const ok = await STATE.flush();
    if (!ok) { UI.toast('تعذّر الحفظ قبل التحديث — صدِّر المشروع أولًا', 'error'); return; }
    if (STATE.data.dirty.size) { UI.toast('احفظ الملفات غير المحفوظة قبل التحديث (Ctrl+S)', 'warn'); return; }
    this._updating = true;
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  },

  checkForUpdate(manual = false) {
    if (this.swReg) this.swReg.update();
    if (manual) UI.toast(this.updateReady ? 'يوجد تحديث جاهز — نفّذ «تطبيق التحديث»' : 'جارٍ البحث عن التحديثات…', 'info', 2400);
  },

  /** أفعال مشروطة عبر رابط (اختيار قصيرة في manifest shortcuts) */
  processUrlAction() {
    const q = new URLSearchParams(location.search);
    const act = q.get('action');
    if (act === 'new-file') setTimeout(() => FILES.newFile(), 250);
    else if (act === 'preview') STATE.setSetting('showPreview', true);
    history.replaceState({}, '', location.pathname);
  }
};

/* إقلاع */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await APP.boot();
    APP.processUrlAction();
    window.KINGCODE_READY = true; /* علامة جاهزية للاختبار */
  } catch (e) {
    console.error('[kingCode] boot failed:', e);
  }
});
