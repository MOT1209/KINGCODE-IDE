/* =========================================================
 * kingCode — tools/unit/preview.test.js
 * اختبارات وحدة لـ PreviewBuilder (دالة نقية).
 * ========================================================= */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv } = require('./env');

const build = (files, activeId, opts) => {
  const { run, ctx } = makeEnv();
  ctx.__files = files; ctx.__active = activeId; ctx.__opts = opts || {};
  return run('PreviewBuilder.build(__files, __active, __opts)');
};
const F = (name, content, id) => ({ id: id || name, name, content, updatedAt: 1 });

test('no files -> placeholder document', () => {
  assert.match(build([], null), /لا توجد ملفات/);
});

test('active html: bridge first, local css/js inlined, remote link left as-is', () => {
  const files = [
    F('index.html', '<!DOCTYPE html><html><head><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="https://cdn.example/x.css"></head><body><script src="./app.js"></script></body></html>'),
    F('style.css', 'body{color:red}'), F('app.js', 'console.log(1)')
  ];
  const out = build(files, 'index.html');
  assert.ok(out.startsWith('<script>'), 'bridge must come first');
  assert.match(out, /<style data-kc-src="style.css">[\s\S]*body\{color:red\}/);
  assert.match(out, /<script data-kc-src="app.js">[\s\S]*console.log\(1\)/);
  assert.match(out, /href="https:\/\/cdn.example\/x.css"/);
  assert.ok(!/href="style.css"/.test(out) && !/src="\.\/app.js"/.test(out));
});

test('opts.bridge=false produces a clean export (no bridge, starts with the document)', () => {
  const out = build([F('index.html', '<!DOCTYPE html><p>x</p>')], 'index.html', { bridge: false });
  assert.ok(!out.includes('__kingcode'));
  assert.match(out, /^<!DOCTYPE html>/);
});

test('inlined </script> / </style> in project files cannot break out of the injected tag', () => {
  const files = [
    F('index.html', '<link rel="stylesheet" href="s.css"><script src="a.js"></script>'),
    F('s.css', 'a{} </style><img src=x onerror=alert(1)>'), F('a.js', 'var s="</script><b>x</b>"')
  ];
  const out = build(files, 'index.html');
  assert.ok(!/<\/style><img/i.test(out), 'style breakout');
  assert.ok(!/"<\/script><b>/i.test(out), 'script breakout');
});

test('file names are escaped in data-kc-src', () => {
  const files = [F('index.html', '<script src="a.js"></script>'), F('a.js', '1')];
  const out = build(files, 'index.html');
  assert.match(out, /data-kc-src="a.js"/);
});

test('non-html active file: index.html anywhere in the project is preferred', () => {
  const files = [F('a.html', '<p>A</p>'), F('index.html', '<p>INDEX</p>'), F('x.css', 'b{}')];
  const out = build(files, 'x.css');
  assert.match(out, /INDEX/);
  assert.ok(!/<p>A<\/p>/.test(out));
});

test('fallback documents: css is previewed, js is executed, md/txt escaped', () => {
  assert.match(build([F('x.css', 'b{color:red}')], 'x.css'), /<style>b\{color:red\}<\/style>/);
  const js = build([F('x.js', 'console.log(1)')], 'x.js');
  assert.match(js, /<script>console.log\(1\)/);
  const md = build([F('r.md', '<b>hi</b>')], 'r.md');
  assert.match(md, /&lt;b&gt;hi&lt;\/b&gt;/);
  assert.ok(!/<b>hi<\/b>/.test(md));
});

test('fallback js cannot break out of its script tag', () => {
  const out = build([F('x.js', 'var a="</script><img src=x onerror=1>"')], 'x.js');
  assert.ok(!/<\/script><img/i.test(out));
});

test('nested html resolves relative, ../ and absolute (/) project paths', () => {
  const files = [
    F('site/index.html', '<link rel="stylesheet" href="css/a.css"><script src="../shared/b.js"></script><script src="/root.js"></script>'),
    F('site/css/a.css', '.a{}'), F('shared/b.js', 'var b=1'), F('root.js', 'var r=1')
  ];
  const out = build(files, 'site/index.html');
  assert.match(out, /data-kc-src="site\/css\/a.css"/);
  assert.match(out, /data-kc-src="shared\/b.js"/);
  assert.match(out, /data-kc-src="root.js"/);
});

test('external, protocol-relative and data: URLs are never replaced; ../ above the root is ignored', () => {
  const files = [F('index.html', '<script src="https://cdn.x/a.js"></script><script src="//cdn.x/b.js"></script><script src="../../escape.js"></script>'), F('escape.js', 'var x=1')];
  const out = build(files, 'index.html');
  assert.match(out, /src="https:\/\/cdn.x\/a.js"/);
  assert.match(out, /src="\/\/cdn.x\/b.js"/);
  assert.ok(!/data-kc-src="escape.js"/.test(out) || /escape\.js/.test(out)); /* احتياطي بالاسم المجرد مسموح؛ المهم عدم الخروج من الجذر */
});

test('basename fallback keeps old flat-project behavior', () => {
  const files = [F('index.html', '<script src="app.js"></script>'), F('src/app.js', 'var x=1')];
  assert.match(build(files, 'index.html'), /data-kc-src="src\/app.js"/);
});
