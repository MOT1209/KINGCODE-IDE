/* =========================================================
 * kingCode — tools/packaging/index.js
 * سجل منصات الحزم (يكتشف كل ملف في platforms/ تلقائيًا) + validate/generate.
 * لإضافة منصة جديدة (Capacitor، Tauri…): أضف ملفًا في platforms/ يصدّر
 *   { id, title, ownerInputs(ctx), validate(ctx), generate(ctx) -> [{path, content}], installable[] }
 * ولا شيء آخر يتغيّر. المولّدات لا تلمس الشبكة ولا المفاتيح ولا تبني أي حزمة.
 * ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadContext, findSecretKeys } = require('./common');

const PLATFORM_DIR = path.join(__dirname, 'platforms');

function platforms() {
  return fs.readdirSync(PLATFORM_DIR).filter(f => f.endsWith('.js')).sort().map(f => {
    const p = require(path.join(PLATFORM_DIR, f));
    for (const k of ['id', 'title', 'ownerInputs', 'validate', 'generate']) if (!(k in p)) throw new Error('platform ' + f + ' lacks "' + k + '"');
    return p;
  });
}

function get(id) {
  const p = platforms().find(x => x.id === id);
  if (!p) throw new Error('unknown platform "' + id + '" (known: ' + platforms().map(x => x.id).join(', ') + ')');
  return p;
}

/** { errors, warnings, missing } — errors: قيم موجودة لكنها خاطئة أو أسرار؛ missing: مدخلات المالك الناقصة */
function check(platform, ctx) {
  const secrets = findSecretKeys(ctx.config).map(k => 'packaging/config.json contains a secret-looking key "' + k + '" — remove it (keys/passwords never go in the repo)');
  const v = platform.validate(ctx);
  return { errors: [...secrets, ...v.errors], warnings: v.warnings, missing: platform.ownerInputs(ctx) };
}

/** يعيد الملفات المولَّدة؛ يرفض عند نقص مدخلات المالك إلا مع allowIncomplete (تظهر <<OWNER:key>> في الناتج) */
function generate(platform, ctx, { allowIncomplete = false } = {}) {
  const r = check(platform, ctx);
  if (r.errors.length) throw new Error(r.errors.join('\n'));
  if (r.missing.length && !allowIncomplete) throw new Error('owner inputs missing: ' + r.missing.map(m => m.key).join(', ') + ' (use --allow-incomplete for a marked draft)');
  let files = platform.generate(ctx);
  if (r.missing.length) {
    files = files.map(f => ({ ...f, content: f.content.replace(/: (null|""|\{ "path": null[^}]*\})/g, ': "<<OWNER:input-missing>>"') }));
  }
  return { files, missing: r.missing, warnings: r.warnings };
}

module.exports = { platforms, get, check, generate, loadContext };
