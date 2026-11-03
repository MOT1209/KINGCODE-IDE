/* =========================================================
 * kingCode — tools/unit/env.js
 * يحمّل js/config.js + utils.js + state.js + preview-builder.js في سياق vm بمخزن localStorage وهمي.
 * ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function makeEnv({ failWrites = false } = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (failWrites) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } store.set(k, String(v)); },
    removeItem: k => store.delete(k),
    key: i => Array.from(store.keys())[i], get length() { return store.size; }
  };
  const ctx = vm.createContext({ localStorage, console: { warn() {}, error() {}, log() {} }, setTimeout, clearTimeout, Date, Math, Set, Map, Object, Array, JSON, String, Number, URLSearchParams });
  for (const f of ['js/config.js', 'js/utils.js', 'js/state.js', 'js/preview-builder.js']) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }
  const run = code => vm.runInContext(code, ctx);
  /* حالة نظيفة */
  run('STATE.data.files = []; STATE.data.tabs = []; STATE.data.activeId = null; STATE.data.dirty.clear(); STATE.data.committed.clear();');
  return { run, store, ctx };
}


module.exports = { makeEnv };
