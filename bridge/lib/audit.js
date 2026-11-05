'use strict';
/* Append-only JSONL audit log. Never records secrets (callers pass only metadata). */
const fs = require('fs');
const path = require('path');
const { home } = require('./util');

function file() { return path.join(home(), 'audit.log'); }

function log(action, detail = {}) {
  const rec = { t: new Date().toISOString(), action, ...detail };
  try { fs.appendFileSync(file(), JSON.stringify(rec) + '\n', { mode: 0o600 }); } catch { /* audit must never crash the bridge */ }
  return rec;
}

function tail(n = 200) {
  try {
    const lines = fs.readFileSync(file(), 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } });
  } catch { return []; }
}

module.exports = { log, tail };
