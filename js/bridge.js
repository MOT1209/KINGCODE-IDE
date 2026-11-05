/* =========================================================
 * kingCode — bridge.js
 * عميل «جسر kingCode» المحلي (bridge/). الاتصال حصرًا بعنوان loopback يضبطه المستخدم؛
 * الرمز السري يُحفظ في sessionStorage فقط (يزول بإغلاق التبويب) إلا إذا اختار المستخدم «تذكّر».
 * هذا الملف الوحيد الذي يستدعي fetch، ولا يتصل بأي مضيف غير loopback.
 * ========================================================= */
'use strict';

const BRIDGE = {
  url: '',
  token: '',
  connected: false,
  info: null,

  /** يقبل فقط http://127.0.0.1 أو http://localhost أو http://[::1] */
  validUrl(u) {
    try {
      const p = new URL(u);
      return p.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(p.hostname) && !p.username && !p.password;
    } catch { return false; }
  },

  loadSaved() {
    try {
      this.url = localStorage.getItem('kc.bridge.url') || 'http://127.0.0.1:7878';
      this.token = sessionStorage.getItem('kc.bridge.token') || localStorage.getItem('kc.bridge.token') || '';
    } catch { this.url = 'http://127.0.0.1:7878'; }
  },

  save(remember) {
    try {
      localStorage.setItem('kc.bridge.url', this.url);
      sessionStorage.setItem('kc.bridge.token', this.token);
      if (remember) localStorage.setItem('kc.bridge.token', this.token); else localStorage.removeItem('kc.bridge.token');
    } catch { /* التخزين غير متاح */ }
  },

  forget() {
    this.token = ''; this.connected = false; this.info = null;
    try { sessionStorage.removeItem('kc.bridge.token'); localStorage.removeItem('kc.bridge.token'); } catch { /* ignore */ }
  },

  async connect(url, token, remember) {
    if (!this.validUrl(url)) throw new Error('العنوان يجب أن يكون loopback (http://127.0.0.1:المنفذ)');
    this.url = url.replace(/\/+$/, ''); this.token = token.trim();
    this.info = await this.req('GET', '/v1/info');
    this.connected = true; this.save(remember);
    return this.info;
  },

  disconnect() { this.connected = false; this.info = null; },

  _headers(hasBody) {
    return { Authorization: 'Bearer ' + this.token, ...(hasBody ? { 'Content-Type': 'application/json' } : {}) };
  },

  async req(method, path, body, signal) {
    if (!this.validUrl(this.url)) throw new Error('عنوان الجسر غير صالح');
    let res;
    try {
      res = await fetch(this.url + path, { method, headers: this._headers(!!body), body: body ? JSON.stringify(body) : undefined, signal, cache: 'no-store', credentials: 'omit' });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error('تعذّر الوصول إلى الجسر. هل يعمل (npm run bridge) وهل أصل الصفحة مسموح (--origin)؟', { cause: e });
    }
    let data = null;
    try { data = await res.json(); } catch { /* غير JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
      err.status = res.status; err.code = data && data.error && data.error.code;
      throw err;
    }
    return data;
  },

  /** بثّ NDJSON: يستدعي onEvent لكل سطر ويعيد وعدًا ينتهي بنهاية البث أو الإلغاء */
  async stream(method, path, body, onEvent, signal) {
    const res = await fetch(this.url + path, { method, headers: this._headers(!!body), body: body ? JSON.stringify(body) : undefined, signal, cache: 'no-store', credentials: 'omit' });
    if (!res.ok) {
      let m = 'HTTP ' + res.status; try { m = (await res.json()).error.message; } catch { /* ignore */ }
      throw new Error(m);
    }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line) { try { onEvent(JSON.parse(line)); } catch { /* سطر تالف */ } }
      }
    }
  }
};
