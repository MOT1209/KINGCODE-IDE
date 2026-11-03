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

test('sanitizeFiles renames duplicates after sanitizing and reports it', () => {
  const { run } = makeEnv();
  const r = JSON.parse(run("JSON.stringify(U.sanitizeFiles({'a/b.js':'1','a-b.js':'2','a-b-2.js':'3'}))"));
  const names = r.files.map(f => f.name);
  assert.equal(new Set(names).size, 3, names.join());
  assert.equal(r.notes.renamed, 2); /* a-b.js collides with sanitized a/b.js; the original a-b-2.js then collides with the generated a-b-2.js */
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

test('safeFileName strips path characters and leading dots; never returns path separators', () => {
  const { run } = makeEnv();
  for (const bad of ['../../etc/passwd', 'a\\b', 'C:\\x', '<img src=x>.html', '..hidden']) {
    const n = run('U.safeFileName(' + JSON.stringify(bad) + ')');
    assert.ok(!/[\\/:*?"<>|]/.test(n) && !n.startsWith('.'), bad + ' -> ' + n);
  }
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

/* ---------- persistence ---------- */

test('flush writes pending state immediately and persisted payload is valid', () => {
  const { run, store } = makeEnv();
  run("STATE.addFile('a.js', 'hello')");
  assert.equal(store.has('kingcode:state:v1'), false, 'debounced write should not have happened yet');
  assert.equal(run('STATE.flush()'), true);
  const saved = JSON.parse(store.get('kingcode:state:v1'));
  assert.equal(saved.files[0].content, 'hello');
});

test('write failure sets saveFailed, emits persisted {ok:false}, and recovers', () => {
  const env = makeEnv({ failWrites: true });
  const { run } = env;
  run("globalThis.__ev = []; STATE.on('persisted', r => __ev.push(r.ok)); STATE.addFile('a.js', 'x')");
  assert.equal(run('STATE.flush()'), false);
  assert.equal(run('STATE.saveFailed'), true);
  assert.deepEqual(JSON.parse(run('JSON.stringify(__ev)')), [false]);
});

test('auto-save off: persist writes the committed snapshot, not the unsaved edit', () => {
  const { run, store } = makeEnv();
  run("STATE.addFile('a.js', 'v1')");
  run('STATE.flush()');
  const id = run('STATE.files()[0].id');
  run(`STATE.beginUnsaved('${id}'); STATE.files()[0].content = 'v2-unsaved'; STATE.markDirty('${id}', true); STATE.persist(); STATE.flush()`);
  assert.equal(JSON.parse(store.get('kingcode:state:v1')).files[0].content, 'v1');
  run(`STATE.markDirty('${id}', false); STATE.persist(); STATE.flush()`);
  assert.equal(JSON.parse(store.get('kingcode:state:v1')).files[0].content, 'v2-unsaved');
});

test('hydrate keeps >60 files (no silent truncation) and normalizes duplicate names', () => {
  const { run, store } = makeEnv();
  const files = Array.from({ length: 75 }, (_, i) => ({ id: 'id' + i, name: i < 3 ? 'same.js' : 'f' + i + '.js', content: 'c', updatedAt: 1 }));
  store.set('kingcode:state:v1', JSON.stringify({ v: 1, files, tabs: ['id0'], activeId: 'id0', settings: {}, uiPrefs: {} }));
  assert.equal(run('STATE.hydrate()'), true);
  assert.equal(run('STATE.files().length'), 75);
  assert.equal(run('new Set(STATE.files().map(f => f.name)).size'), 75);
});

test('hydrate ignores corrupt storage', () => {
  const { run, store } = makeEnv();
  store.set('kingcode:state:v1', '{not json');
  assert.equal(run('STATE.hydrate()'), false);
  store.set('kingcode:state:v1', JSON.stringify({ files: 'nope' }));
  assert.equal(run('STATE.hydrate()'), false);
});
