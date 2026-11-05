/* =========================================================
 * kingCode — hub.js
 * «مركز التطوير»: واجهة الجسر (مساحة العمل، Git، الطرفية، الوكلاء، MCP، المهارات، الإضافات، القوالب).
 * كل ما يظهر هنا متصل بنقاط نهاية حقيقية في bridge/ — لا محاكاة. عند عدم الاتصال تظهر الحالة بصراحة.
 * البيانات القادمة من الجسر تُعرض بـ textContent فقط (لا innerHTML).
 * ========================================================= */
'use strict';

const HUB = {
  tab: 'connect',
  linked: new Map(),      // اسم الملف الافتراضي -> آخر محتوى مزامَن مع القرص
  term: { id: null, abort: null, text: '' },
  agentAbort: null,
  agentTaskId: null,
  TABS: [
    ['connect', '🔌 الاتصال'], ['files', '📂 المجلد'], ['git', '🌿 Git'], ['term', '⌨ الطرفية'],
    ['agent', '🤖 الوكيل'], ['mcp', '🧩 MCP'], ['skills', '🎓 المهارات'], ['ext', '📦 الإضافات'], ['tpl', '🏗 القوالب']
  ],

  /* ---------- DOM helper (آمن: نصوص فقط) ---------- */
  h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
    return el;
  },

  btn(label, fn, cls) {
    return this.h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: async e => {
      const b = e.currentTarget; /* يُصفَّر currentTarget بعد أول await */
      b.disabled = true;
      try { await fn(); } catch (err) { UI.toast(err.message, 'error', 6000); } finally { b.disabled = false; }
    } }, label);
  },

  field(label, input) { return this.h('label', { class: 'hub-field' }, this.h('span', {}, label), input); },

  init() {
    BRIDGE.loadSaved();
    U.$('#btnHub')?.addEventListener('click', () => HUB.open());
    const bar = U.$('#hub-tabs');
    for (const [id, label] of this.TABS) {
      bar.append(this.h('button', { class: 'hub-tab', role: 'tab', type: 'button', 'data-tab': id, onclick: () => HUB.show(id) }, label));
    }
    U.$('#hub-close')?.addEventListener('click', () => UI.closeModal('hub-modal'));
    /* دفع الملفات المرتبطة عند كل حفظ (فروق فقط) */
    STATE.on('persisted', () => HUB.pushLinked());
    /* اتصال صامت إن كان الرمز محفوظًا من جلسة سابقة؛ الفشل صامت (الجسر قد لا يعمل) */
    if (BRIDGE.token && BRIDGE.validUrl(BRIDGE.url)) BRIDGE.connect(BRIDGE.url, BRIDGE.token, !!localStorage.getItem('kc.bridge.token')).then(() => EXT_HOST.reload()).catch(() => {});
    Commands.add({ id: 'hub.open', label: 'مركز التطوير (Git، طرفية، وكلاء…)', group: 'جسر', run: () => HUB.open() });
    Commands.add({ id: 'hub.agent', label: 'تشغيل وكيل ذكاء اصطناعي', group: 'جسر', run: () => HUB.open('agent') });
    Commands.add({ id: 'hub.term', label: 'فتح الطرفية', group: 'جسر', run: () => HUB.open('term') });
    Commands.add({ id: 'hub.git', label: 'لوحة Git', group: 'جسر', run: () => HUB.open('git') });
  },

  open(tab) { UI.openModal('hub-modal'); this.show(tab || this.tab); },

  show(tab) {
    this.tab = tab;
    U.$$('#hub-tabs .hub-tab').forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const body = U.$('#hub-body'); body.replaceChildren();
    if (tab !== 'connect' && !BRIDGE.connected) {
      body.append(this.h('div', { class: 'hub-empty' }, this.h('p', {}, 'غير متصل بجسر kingCode. هذه الميزات تحتاج الجسر المحلي (طرفية، Git، وكلاء…).'),
        this.btn('الذهاب إلى الاتصال', async () => this.show('connect'), 'primary')));
      return;
    }
    const fn = this['render_' + tab]; if (fn) fn.call(this, body);
  },

  async need(fn) { try { return await fn(); } catch (e) { UI.toast(e.message, 'error', 6000); return null; } },

  /* ---------- الاتصال ---------- */
  render_connect(body) {
    const url = this.h('input', { type: 'text', value: BRIDGE.url, dir: 'ltr', 'aria-label': 'عنوان الجسر', autocomplete: 'off', spellcheck: 'false' });
    const tok = this.h('input', { type: 'password', value: BRIDGE.token, dir: 'ltr', 'aria-label': 'رمز الجسر', autocomplete: 'off' });
    const rem = this.h('input', { type: 'checkbox' });
    const status = this.h('div', { class: 'hub-status', role: 'status' }, BRIDGE.connected ? '● متصل' : '○ غير متصل');
    const infoBox = this.h('div', { class: 'hub-info', dir: 'ltr' });
    const paintInfo = () => {
      infoBox.replaceChildren();
      const i = BRIDGE.info; if (!i) return;
      const rows = [['Bridge', i.version], ['Platform', i.platform], ['Git', i.git || 'not installed'],
        ['Terminal', i.terminal.pty ? 'real PTY (' + i.terminal.shell + ')' : 'pipes only (no TTY)'], ['Workspace', i.workspace || '— none —'],
        ...i.agents.map(a => [a.label + (a.primary ? ' (primary)' : ''), a.installed ? a.version : a.error]),
        ['GitHub token', i.github.configured ? 'configured on the bridge' : 'not configured']];
      rows.forEach(([k, v]) => infoBox.append(this.h('div', { class: 'hub-kv' }, this.h('b', {}, k), this.h('span', {}, v))));
    };
    paintInfo();
    body.append(
      this.h('p', { class: 'hub-note' }, 'شغّل الجسر على جهازك: ', this.h('code', {}, 'npm run bridge -- --origin ' + location.origin), ' ثم الصق الرمز من الملف ', this.h('code', {}, '~/.kingcode/token'), '. لا يُرسل الرمز إلا إلى عنوان loopback.'),
      this.field('عنوان الجسر', url), this.field('الرمز', tok),
      this.h('label', { class: 'switch-row' }, rem, ' تذكّر الرمز على هذا الجهاز (أقل أمانًا)'),
      this.h('div', { class: 'hub-row' },
        this.btn('اتصال', async () => { await BRIDGE.connect(url.value, tok.value, rem.checked); status.textContent = '● متصل'; paintInfo(); UI.toast('تم الاتصال بالجسر'); EXT_HOST.reload(); this.show('connect'); }, 'primary'),
        this.btn('قطع الاتصال ونسيان الرمز', async () => { BRIDGE.forget(); EXT_HOST.teardown(); this.show('connect'); })),
      status, infoBox);
    if (BRIDGE.connected) body.append(this.workspaceBox());
  },

  workspaceBox() {
    const path = this.h('input', { type: 'text', dir: 'ltr', placeholder: '/home/me/project', value: BRIDGE.info.workspace || '', 'aria-label': 'مسار مساحة العمل' });
    return this.h('div', { class: 'hub-box' }, this.h('h4', {}, 'مساحة العمل'), this.field('المسار على جهازك', path),
      this.btn('فتح مساحة العمل', async () => { const r = await BRIDGE.req('POST', '/v1/workspace/open', { path: path.value }); BRIDGE.info.workspace = r.root; UI.toast('فُتحت: ' + r.root); this.show('files'); }, 'primary'));
  },

  /* ---------- الملفات ---------- */
  async render_files(body) {
    const list = this.h('ul', { class: 'hub-tree', dir: 'ltr', role: 'tree' });
    body.append(this.h('div', { class: 'hub-row' },
      this.btn('↻ تحديث', () => this.loadTree(list)), this.btn('⬆ دفع الملفات المرتبطة', () => this.pushLinked(true)),
      this.btn('↶ تراجع عن آخر حذف/نقل', async () => { const r = await BRIDGE.req('POST', '/v1/fs/undo'); UI.toast('استُعيد: ' + r.restored); await this.loadTree(list); })),
      this.h('p', { class: 'hub-note' }, 'اضغط ملفًا لفتحه في المحرر (يُنسخ إلى المشروع ويُكتب إلى القرص عند كل حفظ). الحذف ينقل إلى سلة قابلة للاستعادة.'), list);
    await this.loadTree(list);
  },

  async loadTree(ul) {
    ul.replaceChildren();
    const t = await this.need(() => BRIDGE.req('GET', '/v1/fs/tree'));
    if (!t) return;
    const draw = (nodes, parent, depth) => {
      for (const n of nodes) {
        const li = this.h('li', { role: 'treeitem', style: 'padding-inline-start:' + depth * 14 + 'px' });
        if (n.type === 'dir') { li.append(this.h('span', { class: 'hub-dir' }, '📁 ' + n.name)); parent.append(li); draw(n.children, parent, depth + 1); }
        else {
          li.append(this.h('button', { class: 'hub-link', type: 'button', onclick: () => this.openRemote(n.path) }, '📄 ' + n.name),
            this.h('button', { class: 'hub-x', type: 'button', 'aria-label': 'حذف ' + n.name, onclick: () => UI.confirm({ title: 'حذف', message: 'نقل «' + n.path + '» إلى السلة؟ (يمكن التراجع)', danger: true, okLabel: 'حذف' }, async ok => {
              if (!ok) return; await this.need(() => BRIDGE.req('POST', '/v1/fs/delete', { path: n.path })); this.loadTree(ul);
            }) }, '✕'));
          parent.append(li);
        }
      }
    };
    draw(t.children, ul, 0);
    if (!t.children.length) ul.append(this.h('li', {}, 'المجلد فارغ'));
  },

  async openRemote(rel) {
    const r = await this.need(() => BRIDGE.req('GET', '/v1/fs/file?path=' + encodeURIComponent(rel)));
    if (!r) return;
    const existing = STATE.fileByName(rel);
    if (existing) {
      existing.content = r.content; existing.updatedAt = Date.now(); STATE.persist(existing.id);
      STATE.setActive(existing.id); EDITOR.open(existing.id); TABS.render?.();
    } else {
      const res = STATE.addFile(rel, r.content);
      if (!res.ok) { UI.toast('تعذّر فتح الملف (' + res.reason + ')', 'error'); return; }
      STATE.setActive(res.file.id); EDITOR.open(res.file.id); FILE_LIST.render(); TABS.render();
    }
    this.linked.set(rel, r.content);
    UI.closeModal('hub-modal');
  },

  async pushLinked(manual) {
    if (!BRIDGE.connected || !this.linked.size) return;
    for (const [name, last] of this.linked) {
      const f = STATE.fileByName(name);
      if (!f) { this.linked.delete(name); continue; }
      if (f.content === last || STATE.isDirty(f.id)) continue;
      try { await BRIDGE.req('PUT', '/v1/fs/file', { path: name, content: f.content }); this.linked.set(name, f.content); if (manual) UI.toast('كُتب: ' + name); }
      catch (e) { UI.toast('فشل الكتابة إلى القرص: ' + e.message, 'error', 6000); }
    }
  },

  /* ---------- Git ---------- */
  async render_git(body) {
    const out = this.h('pre', { class: 'hub-pre', dir: 'ltr', tabindex: '0' });
    const status = this.h('div', { class: 'hub-box' });
    const msg = this.h('input', { type: 'text', placeholder: 'رسالة الإيداع', 'aria-label': 'رسالة الإيداع', dir: 'auto' });
    const bname = this.h('input', { type: 'text', placeholder: 'اسم فرع جديد', 'aria-label': 'اسم فرع', dir: 'ltr' });
    const git = async (path, b) => { try { const r = await BRIDGE.req('POST', '/v1/git/' + path, b || {}); out.textContent = (r.output || 'تم') ; } catch (e) { out.textContent = '✖ ' + e.message; } await refresh(); };
    const refresh = async () => {
      status.replaceChildren();
      let s; try { s = await BRIDGE.req('GET', '/v1/git/status'); } catch (e) { status.append(e.message); return; }
      if (!s.repo) { status.append(this.h('p', {}, 'المجلد ليس مستودع Git.'), this.btn('git init', () => git('init')), this.h('p', { class: 'hub-note' }, 'للاستنساخ استخدم الطرفية: git clone')); return; }
      status.append(this.h('b', { dir: 'ltr' }, '⎇ ' + (s.branch || '?') + (s.upstream ? ' → ' + s.upstream : '') + (s.tracking ? ' [' + s.tracking + ']' : '')));
      const ul = this.h('ul', { class: 'hub-files', dir: 'ltr' });
      s.files.forEach(f => ul.append(this.h('li', {}, this.h('code', {}, f.index + f.worktree), ' ', f.path, ' ',
        this.btn('diff', async () => { const d = await BRIDGE.req('GET', '/v1/git/diff?path=' + encodeURIComponent(f.path)); out.textContent = d.diff || '(لا فروقات غير مُجهَّزة)'; }),
        f.index !== ' ' && f.index !== '?' ? this.btn('unstage', () => git('unstage', { paths: [f.path] })) : this.btn('stage', () => git('add', { paths: [f.path] })))));
      if (s.clean) ul.append(this.h('li', {}, '✓ لا تغييرات'));
      status.append(ul);
    };
    body.append(status,
      this.h('div', { class: 'hub-row' }, this.btn('stage all', () => git('add', {})), msg,
        this.btn('commit', () => git('commit', { message: msg.value }), 'primary')),
      this.h('div', { class: 'hub-row' }, bname, this.btn('إنشاء فرع', () => git('branch', { name: bname.value })),
        this.btn('الفروع', async () => { const r = await BRIDGE.req('GET', '/v1/git/branches'); out.textContent = r.branches.map(b => (b.current ? '* ' : '  ') + b.name).join('\n'); }),
        this.btn('checkout', () => git('checkout', { branch: bname.value })),
        this.btn('merge', () => git('merge', { branch: bname.value })),
        this.btn('rebase', () => git('rebase', { onto: bname.value }))),
      this.h('div', { class: 'hub-row' }, this.btn('السجل', async () => { const r = await BRIDGE.req('GET', '/v1/git/log?n=30'); out.textContent = r.commits.map(c => c.hash.slice(0, 7) + ' ' + c.subject + ' — ' + c.author).join('\n') || '(لا إيداعات)'; }),
        this.btn('fetch', () => git('fetch')), this.btn('pull', () => git('pull')),
        this.btn('push', () => UI.confirm({ title: 'push', message: 'رفع الإيداعات إلى remote؟ (يستخدم اعتمادات Git على جهازك)', okLabel: 'رفع' }, ok => { if (ok) git('push'); }))),
      out);
    await refresh();
  },

  /* ---------- الطرفية ---------- */
  render_term(body) {
    const screen = this.h('pre', { class: 'hub-term', dir: 'ltr', tabindex: '0', 'aria-label': 'خرج الطرفية', 'aria-live': 'off' });
    const input = this.h('input', { type: 'text', dir: 'ltr', placeholder: 'اكتب أمرًا ثم Enter', 'aria-label': 'إدخال الطرفية', autocomplete: 'off', spellcheck: 'false' });
    const paint = () => { screen.textContent = this.term.text; screen.scrollTop = screen.scrollHeight; };
    const send = data => this.need(() => BRIDGE.req('POST', `/v1/term/${this.term.id}/input`, { data }));
    const start = async () => {
      if (this.term.abort) this.term.abort.abort();
      const cols = Math.max(20, Math.floor(screen.clientWidth / 8) || 80), rows = Math.max(5, Math.floor(screen.clientHeight / 17) || 24);
      const s = await BRIDGE.req('POST', '/v1/term', { cols, rows });
      this.term = { id: s.id, abort: new AbortController(), text: '', kind: s.kind };
      const mine = this.term;
      BRIDGE.stream('GET', `/v1/term/${s.id}/stream`, null, ev => {
        if (mine !== this.term) return;
        if (ev.type === 'data') mine.text = (mine.text + this.cleanAnsi(ev.data)).slice(-200000);
        else if (ev.type === 'exit') mine.text += `\n[انتهت الجلسة — الرمز ${ev.code}]\n`;
        if (U.$('#hub-body') && body.contains(screen)) paint();
      }, mine.abort.signal).catch(() => { /* إلغاء */ });
    };
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!this.term.id) { UI.toast('الجلسة قيد البدء… أعد المحاولة بعد لحظة', 'info', 1800); return; } /* لا نمسح ما كُتب */
      send(input.value + '\n'); input.value = '';
    });
    body.append(
      this.h('div', { class: 'hub-row' }, this.btn('+ جلسة جديدة', start, 'primary'),
        this.btn('Ctrl+C', async () => send('\x03')), this.btn('Tab', async () => send('\t')),
        this.btn('إعادة تشغيل', async () => { if (this.term.id) { const s = await BRIDGE.req('POST', `/v1/term/${this.term.id}/restart`); this.term.abort?.abort(); this.term = { id: null, text: '' }; await start(); void s; } }),
        this.btn('إنهاء', async () => { if (this.term.id) { await BRIDGE.req('DELETE', '/v1/term/' + this.term.id); this.term.abort?.abort(); this.term = { id: null, text: '' }; paint(); } })),
      this.h('p', { class: 'hub-note' }, BRIDGE.info.terminal.pty ? 'طرفية PTY حقيقية على جهازك. العرض هنا نصي مبسّط: التطبيقات ذات الشاشة الكاملة (vim، top) لا تُعرض بشكل صحيح.' : 'لا يتوفر PTY (python3 غير موجود): الجلسة عبر أنابيب بلا TTY.'),
      screen, input);
    paint();
    if (!this.term.id) start().catch(e => UI.toast(e.message, 'error'));
  },

  /** يزيل رموز ANSI ويعالج \r و\b بشكل بسيط */
  cleanAnsi(s) {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '').replace(/.\x08/g, '');
  },

  /* ---------- الوكيل ---------- */
  async render_agent(body) {
    const prov = BRIDGE.info.agents;
    const sel = this.h('select', { 'aria-label': 'المزوّد' }, ...prov.map(a => this.h('option', { value: a.id, disabled: !a.installed }, a.label + (a.primary ? ' ★' : '') + (a.installed ? ' — ' + a.version : ' — غير مثبّت'))));
    const first = prov.find(a => a.installed); if (first) sel.value = first.id;
    const model = this.h('input', { type: 'text', dir: 'ltr', placeholder: 'النموذج (اختياري) مثل anthropic/claude-sonnet-4', 'aria-label': 'النموذج' });
    const profile = this.h('select', { 'aria-label': 'الصلاحيات' },
      this.h('option', { value: 'read' }, 'قراءة فقط'), this.h('option', { value: 'edit' }, 'قراءة وتعديل ملفات'), this.h('option', { value: 'full' }, 'كاملة (أوامر وشبكة) — تتطلب موافقة'));
    const mcp = this.h('input', { type: 'checkbox' });
    const skillsBox = this.h('div', { class: 'hub-row' });
    const prompt = this.h('textarea', { rows: '4', dir: 'auto', placeholder: 'اوصف المهمة…', 'aria-label': 'المهمة' });
    const log = this.h('div', { class: 'hub-agentlog', dir: 'ltr', role: 'log', 'aria-live': 'polite' });
    const stat = this.h('div', { class: 'hub-status', role: 'status' }, '');
    const run = async approved => {
      const skills = U.$$('input[data-skill]:checked', skillsBox).map(c => c.dataset.skill);
      log.replaceChildren(); stat.textContent = '⏳ يعمل…';
      this.agentAbort = new AbortController();
      const add = (cls, t) => { log.append(this.h('div', { class: 'ag ' + cls }, t)); log.scrollTop = log.scrollHeight; };
      try {
        await BRIDGE.stream('POST', '/v1/agents/run', { provider: sel.value, prompt: prompt.value, model: model.value || undefined, profile: profile.value, approved, skills, useMcp: mcp.checked }, ev => {
          if (ev.type === 'start') { this.agentTaskId = ev.id; add('sys', 'بدأت المهمة ' + ev.id); }
          else if (ev.type === 'stdout') add('out', ev.text);
          else if (ev.type === 'stderr') add('err', ev.text);
          else if (ev.type === 'event') this.renderAgentEvent(ev.event, add);
          else if (ev.type === 'error') { add('err', ev.message); stat.textContent = '✖ ' + ev.message; }
          else if (ev.type === 'exit') stat.textContent = '■ ' + ev.status + (ev.costUsd != null ? ' — $' + ev.costUsd : '') + (ev.usage ? ' — tokens in/out: ' + (ev.usage.input_tokens || 0) + '/' + (ev.usage.output_tokens || 0) : '');
        }, this.agentAbort.signal);
      } catch (e) { if (e.name !== 'AbortError') stat.textContent = '✖ ' + e.message; }
      this.agentTaskId = null;
    };
    body.append(this.field('المزوّد', sel), this.field('النموذج', model), this.field('الصلاحيات', profile),
      this.h('label', { class: 'switch-row' }, mcp, ' استخدام خوادم MCP المفعّلة (Claude Code)'), skillsBox, prompt,
      this.h('div', { class: 'hub-row' },
        this.btn('▶ تشغيل', async () => {
          if (!prompt.value.trim()) { UI.toast('اكتب المهمة أولًا', 'warn'); return; }
          if (profile.value === 'full') UI.confirm({ title: 'صلاحيات كاملة', message: 'سيتمكن الوكيل من تشغيل أوامر على جهازك والوصول للشبكة داخل مجلد العمل. هل توافق على هذه المهمة؟', danger: true, okLabel: 'أوافق' }, ok => { if (ok) run(true); });
          else await run(false);
        }, 'primary'),
        this.btn('■ إلغاء', async () => { if (this.agentTaskId) await BRIDGE.req('POST', `/v1/agents/${this.agentTaskId}/cancel`); else this.agentAbort?.abort(); }, 'danger'),
        this.btn('السجل', async () => { const r = await BRIDGE.req('GET', '/v1/agents/history'); log.replaceChildren(); r.tasks.slice(0, 30).forEach(t => log.append(this.h('div', { class: 'ag sys' }, `${t.startedAt.slice(0, 19)} ${t.provider}/${t.profile} ${t.status}${t.costUsd != null ? ' $' + t.costUsd : ''} — ${t.prompt.slice(0, 80)}`))); })),
      stat, log);
    const sk = await this.need(() => BRIDGE.req('GET', '/v1/skills'));
    if (sk) sk.skills.filter(s => s.enabled && !s.problems.length).forEach(s => skillsBox.append(this.h('label', { class: 'switch-row' }, this.h('input', { type: 'checkbox', 'data-skill': s.name }), ' 🎓 ' + s.name)));
  },

  renderAgentEvent(ev, add) {
    if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
      for (const c of ev.message.content) {
        if (c.type === 'text') add('out', c.text);
        else if (c.type === 'tool_use') add('tool', '🔧 ' + c.name + ' ' + JSON.stringify(c.input || {}).slice(0, 200));
      }
    } else if (ev.type === 'result') add('sys', '✔ ' + String(ev.result || '').slice(0, 2000));
  },

  /* ---------- MCP ---------- */
  async render_mcp(body) {
    const list = this.h('div', {});
    const id = this.h('input', { type: 'text', dir: 'ltr', placeholder: 'معرّف (مثل github)', 'aria-label': 'معرّف الخادم' });
    const cmd = this.h('input', { type: 'text', dir: 'ltr', placeholder: 'الأمر (stdio) مثل npx أو عنوان http(s)', 'aria-label': 'الأمر أو العنوان' });
    const args = this.h('input', { type: 'text', dir: 'ltr', placeholder: 'المعاملات مفصولة بمسافة', 'aria-label': 'المعاملات' });
    const refresh = async () => {
      list.replaceChildren();
      const r = await this.need(() => BRIDGE.req('GET', '/v1/mcp')); if (!r) return;
      if (!r.servers.length) list.append(this.h('p', { class: 'hub-note' }, 'لا توجد خوادم MCP.'));
      for (const s of r.servers) {
        const tools = this.h('div', { class: 'hub-pre', dir: 'ltr' });
        list.append(this.h('div', { class: 'hub-box' }, this.h('b', { dir: 'ltr' }, s.id + ' · ' + s.type + (s.enabled ? '' : ' (معطّل)')), ' ', this.h('code', { dir: 'ltr' }, s.type === 'stdio' ? [s.command, ...s.args].join(' ') : s.url),
          this.h('div', { class: 'hub-row' },
            this.btn('اختبار', async () => { const t = await BRIDGE.req('POST', `/v1/mcp/${s.id}/test`); tools.textContent = t.ok ? `✔ ${t.serverInfo && t.serverInfo.name}\n` + t.tools.map(x => (x.allowed ? '  ' : '✖ ') + x.name + ' — ' + x.description).join('\n') : '✖ ' + t.error; }),
            this.btn('السجل', async () => { const l = await BRIDGE.req('GET', `/v1/mcp/${s.id}/logs`); tools.textContent = l.logs.map(x => x.t.slice(11, 19) + ' [' + x.level + '] ' + x.msg).join('\n') || '(لا سجلات)'; }),
            this.btn(s.enabled ? 'تعطيل' : 'تفعيل', async () => { await BRIDGE.req('POST', `/v1/mcp/${s.id}/enabled`, { enabled: !s.enabled }); await refresh(); }),
            this.btn('حذف', async () => { await BRIDGE.req('DELETE', '/v1/mcp/' + s.id); await refresh(); }, 'danger')), tools));
      }
    };
    body.append(this.h('div', { class: 'hub-box' }, this.h('h4', {}, 'إضافة خادم'), id, cmd, args,
      this.btn('حفظ الخادم', async () => {
        const isHttp = /^https?:\/\//.test(cmd.value);
        await BRIDGE.req('PUT', '/v1/mcp/' + encodeURIComponent(id.value), isHttp ? { url: cmd.value } : { command: cmd.value, args: args.value.trim() ? args.value.trim().split(/\s+/) : [] });
        id.value = cmd.value = args.value = ''; await refresh();
      }, 'primary'), this.h('p', { class: 'hub-note' }, 'متغيرات البيئة والترويسات السرية تُحفظ على الجسر ولا تعود إلى المتصفح.')), list);
    await refresh();
  },

  /* ---------- المهارات ---------- */
  async render_skills(body) {
    const list = this.h('div', {});
    const name = this.h('input', { type: 'text', dir: 'ltr', placeholder: 'اسم المهارة (حروف صغيرة وشرطات)', 'aria-label': 'اسم المهارة' });
    const content = this.h('textarea', { rows: '8', dir: 'auto', 'aria-label': 'محتوى SKILL.md', placeholder: '---\nname: my-skill\ndescription: متى تُستخدم\n---\nالتعليمات…' });
    const importIn = this.h('input', { type: 'file', accept: '.json', hidden: true });
    importIn.addEventListener('change', async () => {
      const f = importIn.files[0]; if (!f) return;
      const r = await this.need(async () => BRIDGE.req('POST', '/v1/skills/import', { bundle: JSON.parse(await f.text()) }));
      if (r) UI.toast(`استُوردت ${r.imported.length}، تُخطّيت ${r.skipped.length}، أخطاء ${r.errors.length}`); importIn.value = ''; await refresh();
    });
    const refresh = async () => {
      list.replaceChildren();
      const r = await this.need(() => BRIDGE.req('GET', '/v1/skills')); if (!r) return;
      if (!r.skills.length) list.append(this.h('p', { class: 'hub-note' }, 'لا توجد مهارات.'));
      r.skills.forEach(s => list.append(this.h('div', { class: 'hub-box' }, this.h('b', { dir: 'ltr' }, s.name), s.enabled ? '' : ' (معطّلة)', this.h('div', {}, s.description),
        s.problems.length ? this.h('div', { class: 'hub-err' }, '⚠ ' + s.problems.join(' • ')) : null,
        this.h('div', { class: 'hub-row' },
          this.btn('تحرير', async () => { const g = await BRIDGE.req('GET', '/v1/skills/' + s.name); name.value = s.name; content.value = g.content; }),
          this.btn(s.enabled ? 'تعطيل' : 'تفعيل', async () => { await BRIDGE.req('POST', `/v1/skills/${s.name}/enabled`, { enabled: !s.enabled }); await refresh(); }),
          this.btn('تصدير', async () => { const b = await BRIDGE.req('GET', '/v1/skills/export?names=' + s.name); U.downloadText(s.name + '.skill.json', JSON.stringify(b, null, 2), 'application/json'); }),
          this.btn('حذف', async () => { await BRIDGE.req('DELETE', '/v1/skills/' + s.name); await refresh(); }, 'danger')))));
      if (r.logs.length) list.append(this.h('details', {}, this.h('summary', {}, 'سجل الاستخدام (' + r.logs.length + ')'), this.h('pre', { class: 'hub-pre', dir: 'ltr' }, r.logs.slice(-30).map(l => l.t.slice(0, 19) + ' ' + l.skill + ' → ' + (l.provider || '')).join('\n'))));
    };
    body.append(this.h('div', { class: 'hub-box' }, this.h('h4', {}, 'إنشاء / تعديل مهارة'), name, content,
      this.h('div', { class: 'hub-row' },
        this.btn('تحقق', async () => { const v = await BRIDGE.req('POST', '/v1/skills/validate', { name: name.value, content: content.value }); UI.toast(v.problems.length ? v.problems.join(' • ') : 'المهارة صالحة', v.problems.length ? 'warn' : 'info', 6000); }),
        this.btn('حفظ', async () => { await BRIDGE.req('PUT', '/v1/skills/' + encodeURIComponent(name.value), { content: content.value }); UI.toast('حُفظت'); await refresh(); }, 'primary'),
        this.btn('استيراد…', async () => importIn.click()), this.btn('تصدير الكل', async () => { const b = await BRIDGE.req('GET', '/v1/skills/export'); U.downloadText('skills.json', JSON.stringify(b, null, 2), 'application/json'); }))), importIn, list);
    await refresh();
  },

  /* ---------- الإضافات ---------- */
  async render_ext(body) {
    const list = this.h('div', {});
    const area = this.h('textarea', { rows: '6', dir: 'ltr', 'aria-label': 'حزمة الإضافة JSON', placeholder: '{"manifest":{"id":"hello","name":"Hello","version":"1.0.0","main":"main.js","permissions":["ui.notify"]},"files":{"main.js":"kc.notify(\'hi\')"}}' });
    const refresh = async () => {
      list.replaceChildren();
      const r = await this.need(() => BRIDGE.req('GET', '/v1/extensions')); if (!r) return;
      if (!r.extensions.length) list.append(this.h('p', { class: 'hub-note' }, 'لا توجد إضافات.'));
      r.extensions.forEach(x => {
        const perms = this.h('div', { class: 'hub-row' }, ...x.permissions.map(p => this.h('label', { class: 'switch-row' }, this.h('input', { type: 'checkbox', 'data-p': p, checked: x.granted.includes(p) }), ' ' + p)));
        list.append(this.h('div', { class: 'hub-box' }, this.h('b', { dir: 'ltr' }, x.name + ' ' + x.version), x.compatible ? '' : this.h('span', { class: 'hub-err' }, ' ⚠ غير متوافقة (' + x.engines + ')'), this.h('div', {}, x.description), this.h('small', {}, 'الصلاحيات (فعّل ما تمنحه):'), perms,
          this.h('div', { class: 'hub-row' },
            this.btn('حفظ الصلاحيات', async () => { await BRIDGE.req('POST', `/v1/extensions/${x.id}/granted`, { granted: U.$$('input[data-p]:checked', perms).map(c => c.dataset.p) }); UI.toast('حُفظت'); await refresh(); }),
            this.btn(x.enabled ? 'تعطيل' : 'تفعيل', async () => { await BRIDGE.req('POST', `/v1/extensions/${x.id}/enabled`, { enabled: !x.enabled }); await refresh(); if (typeof EXT_HOST !== 'undefined') EXT_HOST.reload(); }),
            this.btn('حذف', async () => { await BRIDGE.req('DELETE', '/v1/extensions/' + x.id); await refresh(); if (typeof EXT_HOST !== 'undefined') EXT_HOST.reload(); }, 'danger'))));
      });
    };
    const install = update => async () => { const r = await BRIDGE.req('POST', '/v1/extensions/install', { bundle: JSON.parse(area.value), update }); UI.toast('ثُبّتت ' + r.name + ' (معطّلة حتى تفعّلها)'); area.value = ''; await refresh(); };
    body.append(this.h('div', { class: 'hub-box' }, this.h('h4', {}, 'تثبيت / تحديث'), area,
      this.h('div', { class: 'hub-row' }, this.btn('تثبيت', install(false), 'primary'), this.btn('تحديث', install(true))),
      this.h('p', { class: 'hub-note' }, 'تعمل الإضافات في Worker معزول بلا DOM ولا شبكة، وتصل فقط إلى ما منحتها من صلاحيات.')), list);
    await refresh();
  },

  /* ---------- القوالب ---------- */
  async render_tpl(body) {
    const r = await this.need(() => BRIDGE.req('GET', '/v1/templates')); if (!r) return;
    const name = this.h('input', { type: 'text', dir: 'ltr', value: 'my-app', 'aria-label': 'اسم المشروع' });
    const dir = this.h('input', { type: 'text', dir: 'ltr', value: 'my-app', 'aria-label': 'المجلد الهدف' });
    body.append(this.field('اسم المشروع', name), this.field('المجلد داخل مساحة العمل', dir), this.h('p', { class: 'hub-note' }, 'القوالب تُنشئ الملفات فقط (لا تثبّت حزمًا ولا تبني). لا يُستبدل أي ملف موجود.'),
      ...r.templates.map(t => this.h('div', { class: 'hub-box' }, this.h('b', {}, t.name), ' · ' + t.files + ' ملف', t.note ? this.h('div', { class: 'hub-note' }, t.note) : null,
        this.btn('إنشاء', async () => { const o = await BRIDGE.req('POST', '/v1/templates/apply', { id: t.id, dir: dir.value, name: name.value }); UI.toast('أُنشئ ' + o.created.length + ' ملف'); }, 'primary'))));
  }
};
