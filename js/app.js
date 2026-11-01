/* =========================================================
 * kingCode — app.js
 * المنسق الرئيسي: الإقلاع، Service Worker، أفعال URL
 * ========================================================= */
'use strict';

const APP = {
  swReg: null,

  boot() {
    /* 1) الحالة */
    const had = STATE.hydrate();
    if (!had) STATE.bootstrapDefaults();

    /* 2) الوحدات */
    FILE_LIST.init();
    TABS.init();
    PALETTE.init();
    UI.init();

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
    UI.setSidebar(STATE.uiPrefs().sidebarOpen);
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

    /* 8) أسماء عالمية (inline onclick + اختبارات) */
    window.files = FILES;
    window.ui = UI;
    window.preview = PREVIEW;
    window.tabs = TABS;
    window.editor = EDITOR;
    window.state = STATE;
    window.kc = { KC, STATE, EDITOR, FILES, TABS, PREVIEW, FILE_LIST, UI, PALETTE, Commands, APP };

    /* 9) Service Worker */
    APP.registerSw();
  },

  updateMetaTheme() {
    const meta = U.$('#metaTheme');
    if (!meta) return;
    const v = getComputedStyle(document.body).getPropertyValue('--statusbar-bg').trim();
    meta.content = v || (STATE.settings().uiTheme === 'dark' ? '#12253a' : '#1d3152');
  },

  registerSw() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
      this.swReg = reg;
      reg.addEventListener?.('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            UI.toast('🆕 تحديث kingCode جديد — سينطبق عند إعادة الفتح', 'info', 6000);
            setTimeout(() => {
              try { nw.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
            }, 4000);
          }
        });
      });
    }).catch(err => console.warn('[kingCode] SW register failed:', err));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  },

  checkForUpdate() {
    if (this.swReg) this.swReg.update();
    UI.toast('جارٍ البحث عن التحديثات…', 'info', 1800);
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
document.addEventListener('DOMContentLoaded', () => {
  try {
    APP.boot();
    APP.processUrlAction();
    window.KINGCODE_READY = true; /* علامة جاهزية للاختبار */
  } catch (e) {
    console.error('[kingCode] boot failed:', e);
  }
});
