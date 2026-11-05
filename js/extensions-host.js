/* =========================================================
 * kingCode — extensions-host.js
 * يشغّل كل إضافة مفعّلة في iframe معزول (sandbox="allow-scripts", أصل معتم، CSP بلا شبكة: ext-sandbox.html).
 * الاتصال الوحيد عبر postMessage، وكل نداء يُفحص ضد الصلاحيات الممنوحة للإضافة (من الجسر).
 * الصلاحيات المنفَّذة: ui.notify, commands.register, files.read, files.write (مشروع المحرر الافتراضي فقط).
 * ========================================================= */
'use strict';

const EXT_HOST = {
  frames: new Map(),   // extId -> { iframe, granted:Set }
  registered: new Set(),

  METHOD_PERM: { notify: 'ui.notify', registerCommand: 'commands.register', readFile: 'files.read', writeFile: 'files.write' },

  init() {
    window.addEventListener('message', e => this.onMessage(e));
  },

  teardown() {
    for (const { iframe } of this.frames.values()) iframe.remove();
    this.frames.clear();
    for (const id of this.registered) Commands._cmds.delete(id);
    this.registered.clear();
  },

  async reload() {
    this.teardown();
    if (!BRIDGE.connected) return;
    let list;
    try { list = (await BRIDGE.req('GET', '/v1/extensions')).extensions; } catch { return; }
    for (const x of list) {
      if (!x.enabled || !x.compatible) continue;
      try {
        const src = await BRIDGE.req('GET', `/v1/extensions/${x.id}/source`);
        this.launch(x, src.code);
      } catch (e) { console.warn('[kingCode] extension', x.id, 'failed to load:', e.message); }
    }
  },

  launch(ext, code) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.title = 'extension ' + ext.id;
    iframe.style.cssText = 'display:none;width:0;height:0;border:0';
    iframe.src = 'ext-sandbox.html';
    this.frames.set(ext.id, { iframe, ext, granted: new Set(ext.granted), code, ready: false });
    document.body.append(iframe);
  },

  find(win) { for (const [id, f] of this.frames) if (f.iframe.contentWindow === win) return [id, f]; return null; },

  async onMessage(e) {
    const hit = this.find(e.source);
    if (!hit) return;                       // ليست من إطار إضافة نعرفه
    const [id, f] = hit, d = e.data || {};
    if (d.type === 'ready' && !f.ready) { f.ready = true; f.iframe.contentWindow.postMessage({ type: 'init', code: f.code }, '*'); return; }
    if (d.type !== 'call' || typeof d.seq !== 'number') return;
    const reply = (error, result) => f.iframe.contentWindow.postMessage({ type: 'reply', seq: d.seq, error, result }, '*');
    try {
      if (d.method === 'log') { console.warn('[ext ' + id + ']', ...(d.args || [])); return reply(null, true); }
      const perm = this.METHOD_PERM[d.method];
      if (!perm) return reply('unknown method');
      if (!f.granted.has(perm)) return reply('permission denied: ' + perm);
      const a = Array.isArray(d.args) ? d.args : [];
      reply(null, await this.dispatch(id, d.method, a));
    } catch (err) { reply(String(err && err.message || err)); }
  },

  async dispatch(id, method, a) {
    if (method === 'notify') { UI.toast('🔌 ' + id + ': ' + String(a[0]).slice(0, 300)); return true; }
    if (method === 'registerCommand') {
      const cmdId = 'ext.' + id + '.' + String(a[0]).replace(/[^\w.-]/g, '').slice(0, 40);
      Commands.add({ id: cmdId, label: String(a[1]).slice(0, 80), group: 'إضافة: ' + id, run: () => this.frames.get(id)?.iframe.contentWindow.postMessage({ type: 'run', id: String(a[0]) }, '*') });
      this.registered.add(cmdId); return true;
    }
    if (method === 'readFile') { const f = STATE.fileByName(a[0]); if (!f) throw new Error('file not found'); return f.content; }
    if (method === 'writeFile') {
      const name = U.safePath(a[0]); if (!name) throw new Error('invalid path');
      if (a[1].length > KC.limits.maxFileChars) throw new Error('content too large');
      let f = STATE.fileByName(name);
      if (f) { f.content = a[1]; f.updatedAt = Date.now(); STATE.persist(f.id); if (STATE.data.activeId === f.id) EDITOR.open(f.id); }
      else { const r = STATE.addFile(name, a[1]); if (!r.ok) throw new Error('cannot create file: ' + r.reason); FILE_LIST.render(); TABS.render(); }
      return true;
    }
  }
};
