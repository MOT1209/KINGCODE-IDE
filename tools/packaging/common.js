/* =========================================================
 * kingCode — tools/packaging/common.js
 * سياق مشترك لمولّدات الحزم: يقرأ manifest.json وpackage.json وpackaging/config.json (مدخلات المالك)
 * ويشتق الإصدارات. صفر تبعيات. لا يلمس مفاتيح ولا شهادات ولا شبكة.
 * ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SECRET_KEY = /pass(word|phrase)?|secret|token|private|api[_-]?key/i;

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

/** 1.5.1 -> { semver:'1.5.1', code:10501, win:'1.5.1.0' }  (code = major*10000 + minor*100 + patch; monotonic while minor,patch < 100) */
function deriveVersion(semver) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver || '');
  if (!m) throw new Error('package.json version is not x.y.z: ' + semver);
  const [maj, min, pat] = [+m[1], +m[2], +m[3]];
  if (min > 99 || pat > 99) throw new Error('minor/patch > 99 breaks the Android versionCode scheme; change deriveVersion');
  return { semver, code: maj * 10000 + min * 100 + pat, win: semver + '.0' };
}

/** يعثر على مفاتيح تبدو أسرارًا في الإعدادات (يُرفض وجودها) */
function findSecretKeys(obj, prefix = '') {
  const found = [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (k.startsWith('_')) continue;
    if (SECRET_KEY.test(k)) found.push(prefix + k);
    if (v && typeof v === 'object' && !Array.isArray(v)) found.push(...findSecretKeys(v, prefix + k + '.'));
  }
  return found;
}

/** يبني السياق. root وconfig قابلان للتجاوز في الاختبارات. */
function loadContext(opts = {}) {
  const root = opts.root || ROOT;
  const manifest = readJson(path.join(root, 'manifest.json'));
  const pkg = readJson(path.join(root, 'package.json'));
  const config = opts.config || readJson(path.join(root, 'packaging', 'config.json'));
  const origin = typeof config.origin === 'string' ? config.origin.replace(/\/+$/, '') : null;
  return { root, manifest, pkg, config, origin, version: deriveVersion(pkg.version) };
}

/** رابط مطلق على الأصل لمسار نسبي من المانيفست */
function abs(ctx, rel) { return ctx.origin + '/' + String(rel).replace(/^\.?\//, ''); }

module.exports = { ROOT, loadContext, deriveVersion, findSecretKeys, abs, readJson };
