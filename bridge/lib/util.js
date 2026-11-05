'use strict';
/* King Bridge — shared helpers (zero dependencies). */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code || 'error'; }
}

function home() {
  const h = process.env.KINGCODE_HOME || path.join(os.homedir(), '.kingcode');
  fs.mkdirSync(h, { recursive: true, mode: 0o700 });
  return h;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

/** Atomic JSON write (temp file + rename) with private permissions. */
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'request body too large', 'too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(v && typeof v === 'object' ? v : {}); }
      catch { reject(new HttpError(400, 'invalid JSON body', 'bad_json')); }
    });
    req.on('error', reject);
  });
}

function str(v, name, { max = 4096, min = 0, optional = false } = {}) {
  if (v === undefined || v === null) { if (optional) return undefined; throw new HttpError(400, `"${name}" is required`, 'bad_input'); }
  if (typeof v !== 'string' || v.length < min || v.length > max || v.includes('\0')) throw new HttpError(400, `"${name}" is invalid`, 'bad_input');
  return v;
}

const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function id(v, name = 'id') {
  if (typeof v !== 'string' || !ID_RE.test(v)) throw new HttpError(400, `"${name}" must match ${ID_RE}`, 'bad_input');
  return v;
}

/** Minimal semver compare for "x.y.z" strings. */
function cmpVer(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1; }
  return 0;
}
/** Supports ">=1.2.0", "<2.0.0", ">=1.2.0 <2.0.0", "1.x", exact. */
function satisfies(version, range) {
  if (!range || range === '*') return true;
  return String(range).trim().split(/\s+/).every(part => {
    let m = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(part);
    if (m) { const c = cmpVer(version, m[2]); switch (m[1] || '=') { case '>=': return c >= 0; case '<=': return c <= 0; case '>': return c > 0; case '<': return c < 0; default: return c === 0; } }
    m = /^(\d+)\.x$/.exec(part);
    if (m) return String(version).split('.')[0] === m[1];
    return false;
  });
}

module.exports = { HttpError, home, readJson, writeJson, readBody, str, id, cmpVer, satisfies };
