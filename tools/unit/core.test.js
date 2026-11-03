/* =========================================================
 * kingCode — tools/unit/core.test.js
 * اختبارات وحدة (Node المدمج node:test — بلا تبعيات) لطبقة الحالة والتنقية.
 * تُحمَّل js/config.js + utils.js + state.js (+ preview-builder.js إن وُجد) في سياق vm بمخزن localStorage وهمي.
 * التشغيل: npm run test:unit
 * ========================================================= */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeEnv } = require('./env');

/* ---------- U.sanitizeFiles ---------- */

test('sanitizeFiles rejects arrays, strings, null, empty', () => {
  const { run } = makeEnv();
  assert.equal(run("U.sanitizeFiles(['a','b'])"), null);
  assert.equal(run("U.sanitizeFiles('x')"), null);
  assert.equal(run('U.sanitizeFiles(null)'), null);
  assert.equal(run('U.sanitizeFiles({})'), null);
});

test('sanitizeFiles keeps folder paths, renames exact duplicates and file/folder clashes, and reports it', () => {
  const { run } = makeEnv();
  const r = JSON.parse(run(`JSON.stringify(U.sanitizeFiles({
    'src/app.js': '1', 'src\\\\app.js': '2', 'docs': 'a file named docs', 'docs/readme.md': 'inside docs', 'x//y.js': '3'
  }))`));
  const names = r.files.map(f => f.name);
  assert.ok(names.includes('src/app.js'), names.join());
  assert.ok(names.includes('x/y.js'), 'empty segments should collapse: ' + names.join());
  assert.equal(new Set(names).size, names.length, 'duplicate names remain: ' + names.join());
  /* 'docs' (file) then 'docs/readme.md' (needs docs as folder): the latter is flattened */
  assert.ok(names.includes('docs') && names.includes('docs-readme.md'), names.join());
  assert.ok(r.notes.renamed >= 2);
});

test('sanitizeFiles caps count, drops oversized/invalid, blanks non-text — all reported', () => {
  const { run } = makeEnv();
  const r = JSON.parse(run(`(function(){
    const o = {};
    for (let i = 0; i < 70; i++) o['f' + i + '.txt'] = 'x';
    o['big.txt'] = 'y'.repeat(KC.limits.maxFileChars + 1);
    o['..'] = 'bad'; o['n.js'] = { content: 5 };
    return JSON.stringify(U.sanitizeFiles(o));
  })()`));
  assert.equal(r.files.length, 60);
  assert.equal(r.notes.tooLarge, 1);
  assert.equal(r.notes.invalid, 1);
  assert.ok(r.notes.truncated >= 10);
  assert.ok(r.notes.blank >= 0);
});

test('safeFileName strips path characters and leading dots; safePath never escapes the project', () => {
  const { run } = makeEnv();
  for (const bad of ['a\\b', 'C:\\x', '<img src=x>.html', '..hidden']) {
    const n = run('U.safeFileName(' + JSON.stringify(bad) + ')');
    assert.ok(!/[\\/:*?"<>|]/.test(n) && !n.startsWith('.'), bad + ' -> ' + n);
  }
  for (const [raw, want] of [['../../etc/passwd', 'etc/passwd'], ['/abs/path.js', 'abs/path.js'], ['a/./b/../c.js', 'a/b/c.js'], ['.', ''], ['..', ''], ['//', ''], ['a\\b\\c.js', 'a/b/c.js']]) {
    assert.equal(run('U.safePath(' + JSON.stringify(raw) + ')'), want, raw);
  }
  assert.equal(run("U.safePath('a/b/c/d/e/f/g/h/i.js')"), '', 'depth limit');
  assert.equal(run("U.safePath('x'.repeat(40) + '/' + 'y'.repeat(40) + '/' + 'z'.repeat(40) + '/' + 'w'.repeat(40) + '/' + 'v'.repeat(40) + '.js')"), '', 'length limit');
});

test('extOf/langFor use the last path segment only (dots in folder names are ignored)', () => {
  const { run } = makeEnv();
  assert.equal(run("KC.extOf('dir.v2/readme')"), '');
  assert.equal(run("KC.extOf('src/app.test.JS')"), 'js');
  assert.equal(run("KC.langFor('a.b/c.css').label"), 'CSS');
});

/* ---------- STATE write path ---------- */

test('addFile enforces invalid / duplicate / limit', () => {
  const { run } = makeEnv();
  assert.equal(run("STATE.addFile('', 'x').reason"), 'invalid');
  assert.equal(run("STATE.addFile('..', 'x').reason"), 'invalid');
  assert.equal(run("STATE.addFile('a.js', 'x').ok"), true);
  assert.equal(run("STATE.addFile('a.js', 'y').reason"), 'duplicate');
  run("for (let i = 0; i < 59; i++) STATE.addFile('g' + i + '.js', '')");
  assert.equal(run('STATE.files().length'), 60);
  assert.equal(run("STATE.addFile('over.js', '').reason"), 'limit');
});

test('addFile at tab limit evicts a non-active tab, never the active one', () => {
  const { run } = makeEnv();
  run("for (let i = 0; i < 12; i++) STATE.addFile('t' + i + '.js', '')");
  run('STATE.data.activeId = STATE.data.tabs[0]');
  const active = run('STATE.data.activeId');
  run("STATE.addFile('new.js', '')");
  assert.equal(run('STATE.data.tabs.length'), 12);
  assert.ok(run('STATE.data.tabs').includes(active), 'active tab evicted');
});

test('renameFile: duplicate/invalid/same/missing rejected; success renames', () => {
  const { run } = makeEnv();
  run("STATE.addFile('a.js', ''); STATE.addFile('b.js', '')");
  const idA = run("STATE.fileByName('a.js').id");
  assert.equal(run(`STATE.renameFile('${idA}', 'b.js').reason`), 'duplicate');
  assert.equal(run(`STATE.renameFile('${idA}', '').reason`), 'invalid');
  assert.equal(run(`STATE.renameFile('${idA}', 'a.js').reason`), 'same');
  assert.equal(run("STATE.renameFile('nope', 'z.js').reason"), 'missing');
  assert.equal(run(`STATE.renameFile('${idA}', 'c.js').ok`), true);
  assert.equal(run("STATE.fileByName('c.js') !== null && STATE.fileByName('a.js') === null"), true);
});

test('removeFile: refuses the last file; reassigns active; clears dirty', () => {
  const { run } = makeEnv();
  run("STATE.addFile('a.js', ''); STATE.addFile('b.js', '')");
  const idA = run("STATE.fileByName('a.js').id");
  const idB = run("STATE.fileByName('b.js').id");
  run(`STATE.data.activeId = '${idA}'; STATE.markDirty('${idA}', true)`);
  const r = JSON.parse(run(`JSON.stringify(STATE.removeFile('${idA}'))`));
  assert.equal(r.ok, true);
  assert.equal(r.activeId, idB);
  assert.equal(run(`STATE.isDirty('${idA}')`), false);
  assert.equal(run(`STATE.removeFile('${idB}').reason`), 'last');
});

test('replaceProject sets tabs/active, clears dirty state, caps at maxFiles', () => {
  const { run } = makeEnv();
  run("STATE.addFile('old.js', ''); STATE.markDirty(STATE.files()[0].id, true)");
  run("STATE.replaceProject(Array.from({length: 80}, (_, i) => ({ id: 'i' + i, name: 'n' + i, content: '', updatedAt: 1 })))");
  assert.equal(run('STATE.files().length'), 60);
  assert.equal(run('STATE.data.activeId'), 'i0');
  assert.equal(run('STATE.data.dirty.size'), 0);
  assert.equal(run('STATE.data.tabs.length'), 1);
});

test('uniqueName appends -2, -3 before the extension', () => {
  const { run } = makeEnv();
  run("STATE.addFile('x.js', ''); STATE.addFile('x-2.js', '')");
  assert.equal(run("STATE.uniqueName('x.js')"), 'x-3.js');
  assert.equal(run("STATE.uniqueName('free.js')"), 'free.js');
  run("STATE.addFile('noext', '')");
  assert.equal(run("STATE.uniqueName('noext')"), 'noext-2');
});

/* ---------- VFS: paths & folders ---------- */

test('files keep paths; file/folder clashes are rejected for user actions', () => {
  const { run } = makeEnv();
  assert.equal(run("STATE.addFile('src/app.js', '1').file.name"), 'src/app.js');
  assert.equal(run("STATE.addFile('src', 'x').reason"), 'conflict', 'file named like an existing folder');
  assert.equal(run("STATE.addFile('src/app.js/x.js', 'x').reason"), 'conflict', 'file used as a folder');
  assert.equal(run("STATE.addFile('src/app.js', 'x').reason"), 'duplicate');
  assert.deepEqual(JSON.parse(run('JSON.stringify(STATE.folderPaths())')), ['src']);
});

test('addFolder: validates, creates empty folders, rejects clashes/duplicates', () => {
  const { run } = makeEnv();
  run("STATE.addFile('index.html', '')");
  assert.equal(run("STATE.addFolder('assets/img').ok"), true);
  assert.deepEqual(JSON.parse(run('JSON.stringify(STATE.folderPaths())')), ['assets', 'assets/img']);
  assert.equal(run("STATE.addFolder('assets').reason"), 'duplicate', 'implicit ancestor already exists');
  assert.equal(run("STATE.addFolder('index.html').reason"), 'conflict');
  assert.equal(run("STATE.addFolder('index.html/sub').reason"), 'conflict');
  assert.equal(run("STATE.addFolder('..').reason"), 'invalid');
});

test('renameFolder moves files, nested folders and empty folders; rejects bad targets', () => {
  const { run } = makeEnv();
  run("STATE.addFile('a/x.js', '1'); STATE.addFile('a/b/y.js', '2'); STATE.addFile('z.js', '3'); STATE.addFolder('a/empty')");
  const r = JSON.parse(run("JSON.stringify(STATE.renameFolder('a', 'lib'))"));
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(run('JSON.stringify(STATE.files().map(f => f.name).sort())')), ['lib/b/y.js', 'lib/x.js', 'z.js']);
  assert.ok(JSON.parse(run('JSON.stringify(STATE.folderPaths())')).includes('lib/empty'));
  assert.equal(run("STATE.renameFolder('lib', 'lib/inner').reason"), 'inside');
  assert.equal(run("STATE.renameFolder('lib', 'z.js').reason"), 'conflict');
  assert.equal(run("STATE.renameFolder('nope', 'q').reason"), 'missing');
  run("STATE.addFile('other/o.js', '')");
  assert.equal(run("STATE.renameFolder('lib', 'other').reason"), 'duplicate');
});

test('removeFolder deletes contents, fixes tabs/active, refuses to empty the project', () => {
  const { run } = makeEnv();
  run("STATE.addFile('keep.js', ''); STATE.addFile('d/a.js', ''); STATE.addFile('d/e/b.js', ''); STATE.addFolder('d/empty')");
  run("STATE.data.activeId = STATE.fileByName('d/a.js').id");
  const r = JSON.parse(run("JSON.stringify(STATE.removeFolder('d'))"));
  assert.equal(r.ok, true);
  assert.equal(r.removed.length, 2);
  assert.deepEqual(JSON.parse(run('JSON.stringify(STATE.files().map(f => f.name))')), ['keep.js']);
  assert.equal(run('STATE.data.activeId'), run("STATE.fileByName('keep.js').id"));
  assert.equal(run('STATE.hasFolder("d") || STATE.hasFolder("d/empty")'), false);
  run("STATE.addFile('only/x.js', '')");
  run("STATE.removeFile(STATE.fileByName('keep.js').id)");
  assert.equal(run("STATE.removeFolder('only').reason"), 'last');
});

test('renameFile can move a file into/out of folders and rejects clashes', () => {
  const { run } = makeEnv();
  run("STATE.addFile('a.js', ''); STATE.addFile('src/b.js', '')");
  const id = run("STATE.fileByName('a.js').id");
  assert.equal(run(`STATE.renameFile('${id}', 'src/a.js').ok`), true);
  assert.equal(run(`STATE.renameFile('${id}', 'src/b.js').reason`), 'duplicate');
  assert.equal(run(`STATE.renameFile('${id}', 'src').reason`), 'conflict');
  assert.equal(run(`STATE.renameFile('${id}', 'moved.js').ok`), true);
});

test('uniqueName keeps the folder and only touches the file name', () => {
  const { run } = makeEnv();
  run("STATE.addFile('dir.v2/readme', '')");
  assert.equal(run("STATE.uniqueName('dir.v2/readme')"), 'dir.v2/readme-2');
  run("STATE.addFile('src/x.js', '')");
  assert.equal(run("STATE.uniqueName('src/x.js')"), 'src/x-2.js');
});

test('folders (including empty ones) survive persist -> load -> hydrate', async () => {
  const { run } = makeEnv();
  await run('STORE.init()');
  run("STATE.addFile('a/x.js', 'x'); STATE.addFolder('empty/deeper')");
  assert.equal(await run('STATE.flush()'), true);
  run("STATE.data.files = []; STATE.data.folders = []");
  assert.equal(await run('STORE.load().then(s => STATE.hydrate(s))'), true);
  assert.deepEqual(JSON.parse(run('JSON.stringify(STATE.folderPaths())')), ['a', 'empty', 'empty/deeper']);
  assert.equal(run('STATE.files()[0].name'), 'a/x.js');
});

test('hydrate resolves file/folder clashes found in stored data', () => {
  const { run } = makeEnv();
  run(`globalThis.__s = ${JSON.stringify({ files: [{ id: '1', name: 'docs', content: '' }, { id: '2', name: 'docs/a.md', content: '' }], folders: ['docs', 'ok'] })}`);
  assert.equal(run('STATE.hydrate(__s)'), true);
  const names = JSON.parse(run('JSON.stringify(STATE.files().map(f => f.name))'));
  assert.equal(new Set(names).size, 2);
  assert.ok(!names.some(n => n.startsWith('docs/')), 'clash not resolved: ' + names);
  assert.deepEqual(JSON.parse(run('JSON.stringify(STATE.data.folders)')), ['ok']);
});

/* ---------- persistence (خلفية localStorage: لا indexedDB داخل vm) ---------- */

test('flush writes pending state and persisted payload is valid', async () => {
  const { run, store } = makeEnv();
  await run('STORE.init()');
  run("STATE.addFile('a.js', 'hello')");
  assert.equal(store.has('kingcode:state:v1'), false, 'debounced write should not have happened yet');
  assert.equal(await run('STATE.flush()'), true);
  const saved = JSON.parse(store.get('kingcode:state:v1'));
  assert.equal(saved.files[0].content, 'hello');
  assert.ok(saved.savedAt > 0);
});

test('write failure sets saveFailed, emits persisted {ok:false}, keeps the change pending for retry', async () => {
  const { run } = makeEnv({ failWrites: true });
  await run('STORE.init()');
  run("globalThis.__ev = []; STATE.on('persisted', r => __ev.push(r.ok)); STATE.addFile('a.js', 'x')");
  assert.equal(await run('STATE.flush()'), false);
  assert.equal(run('STATE.saveFailed'), true);
  assert.equal(run('STATE._pending'), true, 'failed write must stay pending');
  assert.deepEqual(JSON.parse(run('JSON.stringify(__ev)')), [false]);
});

test('write failure then recovery: next flush succeeds and clears saveFailed', async () => {
  const env = makeEnv();
  const { run } = env;
  await run('STORE.init()');
  run("STATE.addFile('a.js', 'x')");
  /* أفشل الكتابة مؤقتًا عبر استبدال الدالة ثم أعدها */
  run("globalThis.__orig = STORE._saveLocal; STORE._saveLocal = () => false;");
  assert.equal(await run('STATE.flush()'), false);
  run('STORE._saveLocal = __orig');
  assert.equal(await run('STATE.flush()'), true);
  assert.equal(run('STATE.saveFailed'), false);
});

test('writes are serialized (no two saves in flight)', async () => {
  const { run } = makeEnv();
  await run('STORE.init()');
  run(`globalThis.__inflight = 0; globalThis.__max = 0; const o = STORE.save.bind(STORE);
       STORE.save = async (...a) => { __inflight++; __max = Math.max(__max, __inflight); await new Promise(r => setTimeout(r, 15)); const v = await o(...a); __inflight--; return v; };`);
  run("STATE.addFile('a.js', '1')");
  const p1 = run('STATE.flush()');
  run("STATE.addFile('b.js', '2')");
  const p2 = run('STATE.flush()');
  await Promise.all([p1, p2]);
  assert.equal(run('__max'), 1);
});

test('auto-save off: persist writes the committed snapshot, not the unsaved edit', async () => {
  const { run, store } = makeEnv();
  await run('STORE.init()');
  run("STATE.addFile('a.js', 'v1')");
  await run('STATE.flush()');
  const id = run('STATE.files()[0].id');
  run(`STATE.beginUnsaved('${id}'); STATE.files()[0].content = 'v2-unsaved'; STATE.markDirty('${id}', true); STATE.persist('${id}');`);
  await run('STATE.flush()');
  assert.equal(JSON.parse(store.get('kingcode:state:v1')).files[0].content, 'v1');
  run(`STATE.markDirty('${id}', false); STATE.persist('${id}');`);
  await run('STATE.flush()');
  assert.equal(JSON.parse(store.get('kingcode:state:v1')).files[0].content, 'v2-unsaved');
});

test('hydrate keeps >60 files (no silent truncation) and normalizes duplicate names', async () => {
  const { run } = makeEnv();
  const files = Array.from({ length: 75 }, (_, i) => ({ id: 'id' + i, name: i < 3 ? 'same.js' : 'f' + i + '.js', content: 'c', updatedAt: 1 }));
  run(`globalThis.__snap = ${JSON.stringify({ v: 1, files, tabs: ['id0'], activeId: 'id0', settings: {}, uiPrefs: {} })}`);
  assert.equal(run('STATE.hydrate(__snap)'), true);
  assert.equal(run('STATE.files().length'), 75);
  assert.equal(run('new Set(STATE.files().map(f => f.name)).size'), 75);
});

test('hydrate ignores corrupt snapshots', () => {
  const { run } = makeEnv();
  assert.equal(run('STATE.hydrate(null)'), false);
  assert.equal(run("STATE.hydrate({ files: 'nope' })"), false);
  assert.equal(run('STATE.hydrate({ files: [] })'), false);
});

/* ---------- STORE: تحميل/ترحيل/سجل الطوارئ ---------- */

test('STORE.load reads the legacy localStorage blob; corrupt blob -> null', async () => {
  const { run, store } = makeEnv();
  await run('STORE.init()');
  assert.equal(await run('STORE.load()'), null);
  store.set('kingcode:state:v1', '{bad json');
  assert.equal(await run('STORE.load()'), null);
  store.set('kingcode:state:v1', JSON.stringify({ files: [{ id: 'a', name: 'a.js', content: 'x', updatedAt: 1 }], tabs: [], savedAt: 5 }));
  const snap = JSON.parse(await run('STORE.load().then(s => JSON.stringify(s))'));
  assert.equal(snap.files[0].name, 'a.js');
});

test('journal newer than the last save is applied on load and edits survive; older journal is dropped', async () => {
  const { run, store } = makeEnv();
  await run('STORE.init()');
  store.set('kingcode:state:v1', JSON.stringify({ files: [{ id: 'a', name: 'a.js', content: 'old', updatedAt: 1 }], tabs: ['a'], activeId: 'a', savedAt: 100 }));
  store.set('kingcode:journal:v1', JSON.stringify({ t: 200, files: [{ id: 'a', name: 'a.js', content: 'NEW', updatedAt: 2 }], tabs: ['a'], activeId: 'a' }));
  let snap = JSON.parse(await run('STORE.load().then(s => JSON.stringify(s))'));
  assert.equal(snap.files[0].content, 'NEW');
  assert.equal(snap._fromJournal, true);
  store.set('kingcode:journal:v1', JSON.stringify({ t: 50, files: [{ id: 'a', name: 'a.js', content: 'STALE', updatedAt: 2 }] }));
  snap = JSON.parse(await run('STORE.load().then(s => JSON.stringify(s))'));
  assert.equal(snap.files[0].content, 'old');
  assert.equal(store.has('kingcode:journal:v1'), false, 'stale journal should be removed');
});

test('journal entries with invalid shape are ignored', async () => {
  const { run, store } = makeEnv();
  await run('STORE.init()');
  store.set('kingcode:state:v1', JSON.stringify({ files: [{ id: 'a', name: 'a.js', content: 'old', updatedAt: 1 }], savedAt: 1 }));
  store.set('kingcode:journal:v1', JSON.stringify({ t: 9, files: [null, { id: 5 }, { name: 'x' }] }));
  const snap = JSON.parse(await run('STORE.load().then(s => JSON.stringify(s))'));
  assert.equal(snap.files.length, 1);
  assert.equal(snap.files[0].content, 'old');
});

test('backup round-trips through STORE (local backend)', async () => {
  const { run } = makeEnv();
  await run('STORE.init()');
  assert.equal(await run("STORE.putBackup({ savedAt: 1, files: { 'a.js': 'x' } })"), true);
  const b = JSON.parse(await run('STORE.getBackup().then(b => JSON.stringify(b))'));
  assert.equal(b.files['a.js'], 'x');
});
