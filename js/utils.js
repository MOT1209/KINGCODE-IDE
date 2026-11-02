/* =========================================================
 * kingCode — utils.js
 * أدوات عامة: DOM، مؤقتات، تخزين آمن، تحميل، تحقق
 * ========================================================= */
'use strict';

const U = {

  $: (sel, root = document) => root.querySelector(sel),
  $$: (sel, root = document) => Array.from(root.querySelectorAll(sel)),

  /** معرّف فريد قصير */
  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  /** debounce بسيط مع إمكانية الإلغاء */
  debounce(fn, ms = 300) {
    let t;
    const wrapped = (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
    wrapped.cancel = () => clearTimeout(t);
    return wrapped;
  },

  escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  },

  clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  },

  /* ---------- التخزين الآمن (localStorage متزامن + عزل أخطاء) ----------
 * ملاحظة: IndexedDB غير متزامن بطبيعته وبه مستهلكون متزامنون هنا
 * (state.hydrate، TABS.open، EDITOR.change، ...). أي ترقية مستقبلية
 * إلى IDB تتطلب جعل كل المستهلكين async أولاً؛ لا تُدمج IDB هنا دون ذلك.
 */

  storage: {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        console.warn('[kingCode] storage read failed:', e);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        /* quota exceeded أو وضع خاص: إخطار واحد غير متكرر */
        if (!this._quotaWarned) {
          this._quotaWarned = true;
          try { UI.toast('مساحة التخزين ممتلئة — صدِّر المشروع لتفادي فقدان البيانات ⚠️', 'warn', 6000); }
          catch (_) { console.warn('[kingCode] storage quota exceeded:', e); }
        }
        return false;
      }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* تجاهل */ }
    },
    usage() {
      try {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          total += (k.length + (localStorage.getItem(k) || '').length) * 2;
        }
        return total;
      } catch (e) { return 0; }
    }
  },

  /* ---------- التفريغ/الإثراء ---------- */

  /** تنزيل ملف نصي باسم محدد */
  downloadText(name, content, mime = 'text/plain') {
    try {
      const blob = new Blob([content], { type: mime + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return true;
    } catch (e) {
      console.error('[kingCode] download failed:', e);
      return false;
    }
  },

  /** قراءة ملف (File) كنص — يعيد Promise */
  readText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error('read error'));
      reader.readAsText(file);
    });
  },

  /** تنظيف اسم ملف من المحارف الخطرة */
  safeFileName(name) {
    let n = String(name || '').replace(/[\\/:*?"<>|#%&]+/g, '-').trim();
    n = n.replace(/\s+/g, ' ').replace(/^\.+/, '');
    if (n.length > 64) n = n.slice(0, 64);
    return n;
  },

  /** تنقية مدخلات JSON القادمة من الاستيراد */
  sanitizeFiles(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const out = [];
    for (const [k, v] of Object.entries(raw)) {
      const name = U.safeFileName(k);
      if (!name) continue;
      const content = typeof v === 'string' ? v
        : v && typeof v === 'object' && typeof v.content === 'string' ? v.content : '';
      out.push({ id: U.uid(), name, content, updatedAt: Date.now() });
    }
    return out.length ? out : null;
  },

  /** مساعد: ينتظر انتقال الشاشة ثم ينفّذ (للتحديث البصري) */
  raf(fn) {
    return (window.requestAnimationFrame || (f => setTimeout(f, 16)))(fn);
  },

  /** إشعار بيئي: هل الشاشة لمسية؟ */
  isTouch() {
    return window.matchMedia('(pointer: coarse)').matches;
  }
};
