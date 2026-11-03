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

  /* التخزين الدائم: انظر js/storage.js (STORE) — IndexedDB مع localStorage احتياطًا */

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

  /** مسار افتراضي سليم: يفصل على / و\\، ينظّف كل مقطع، يحذف المقاطع الفارغة و«.»/«..»؛ يعيد '' إن تجاوز العمق/الطول */
  safePath(raw) {
    const segs = String(raw || '').split(/[\\/]+/).map(s => U.safeFileName(s)).filter(Boolean);
    if (!segs.length || segs.length > KC.limits.maxDepth) return '';
    const p = segs.join('/');
    return p.length > KC.limits.maxPathChars ? '' : p;
  },

  baseName(p) { return String(p || '').split('/').pop(); },
  dirName(p) { const i = String(p || '').lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); },

  /** هل يتعارض المسار مع مجموعة الأسماء؟ (تطابق تام، أو ملف هو أب للمسار، أو المسار نفسه أبٌ لملف) */
  pathConflict(name, names) {
    if (names.has(name)) return 'duplicate';
    for (const n of names) {
      if (n.startsWith(name + '/') || name.startsWith(n + '/')) return 'conflict';
    }
    return null;
  },

  /** اسم غير متعارض مع المجموعة: عند تعارض ملف/مجلد يُسطَّح المسار (a/b.js → a-b.js)، ثم تُضاف -2 و-3… قبل الامتداد */
  resolveName(name, names) {
    let c = U.pathConflict(name, names);
    if (!c) return name;
    let cand = c === 'conflict' ? name.replace(/\//g, '-') : name;
    if (!U.pathConflict(cand, names)) return cand;
    const dot = cand.lastIndexOf('.');
    const slash = cand.lastIndexOf('/');
    const hasExt = dot > slash + 1;
    const stem = hasExt ? cand.slice(0, dot) : cand;
    const ext = hasExt ? cand.slice(dot) : '';
    let i = 2, out;
    do { out = stem + '-' + i + ext; i++; } while (U.pathConflict(out, names) && i < 100000);
    return out;
  },

  /**
   * تنقية مدخلات JSON القادمة من الاستيراد/الاستعادة.
   * يقبل كائنًا {اسم: محتوى | {content}} فقط (المصفوفات مرفوضة).
   * يعيد { files, notes } أو null؛ notes تُعرض للمستخدم قبل التأكيد — لا إسقاط صامت:
   *   truncated: ملفات تجاوزت الحد الأقصى للعدد | renamed: أسماء أُعيدت تسميتها لتفادي التكرار
   *   blank: محتوى غير نصي استُبدل بنص فارغ | tooLarge: ملفات تجاوزت حجم الملف الأقصى (أُسقطت) | invalid: أسماء غير صالحة (أُسقطت)
   */
  sanitizeFiles(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const notes = { truncated: 0, renamed: 0, blank: 0, tooLarge: 0, invalid: 0 };
    const out = [];
    const used = new Set();
    for (const [k, v] of Object.entries(raw)) {
      let name = U.safePath(k);
      if (!name) { notes.invalid++; continue; }
      let content;
      if (typeof v === 'string') content = v;
      else if (v && typeof v === 'object' && typeof v.content === 'string') content = v.content;
      else { content = ''; notes.blank++; }
      if (content.length > KC.limits.maxFileChars) { notes.tooLarge++; continue; }
      if (out.length >= KC.limits.maxFiles) { notes.truncated++; continue; }
      const resolved = U.resolveName(name, used);
      if (resolved !== name) { name = resolved; notes.renamed++; }
      used.add(name);
      out.push({ id: U.uid(), name, content, updatedAt: Date.now() });
    }
    return out.length ? { files: out, notes } : null;
  },

  /** نص عربي يلخّص ملاحظات sanitizeFiles للمستخدم (فارغ إن لا شيء) */
  describeNotes(n) {
    const p = [];
    if (n.truncated) p.push('سيُهمَل ' + n.truncated + ' ملف لتجاوز الحد الأقصى (' + KC.limits.maxFiles + ')');
    if (n.tooLarge) p.push('سيُهمَل ' + n.tooLarge + ' ملف أكبر من الحد المسموح');
    if (n.invalid) p.push('سيُهمَل ' + n.invalid + ' اسم غير صالح');
    if (n.renamed) p.push('ستُعاد تسمية ' + n.renamed + ' ملف مكرر الاسم');
    if (n.blank) p.push(n.blank + ' ملف بمحتوى غير نصي سيصبح فارغًا');
    return p.join('، ');
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
