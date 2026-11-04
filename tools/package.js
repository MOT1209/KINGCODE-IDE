/* =========================================================
 * kingCode — tools/package.js
 * npm run package:list | package:validate | package:generate -- <android|windows|all> [--allow-incomplete] [--install]
 * يولّد إعدادات التحزيم من manifest.json + packaging/config.json إلى packaging/out/<platform>/ (مُتجاهَل في git).
 * لا يبني AAB/MSIX ولا يوقّع ولا يرسل شيئًا. --install ينسخ الملفات القابلة للنشر (assetlinks.json) إلى جذر المستودع.
 * ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const pk = require('./packaging');

const [cmd, target, ...flags] = process.argv.slice(2);
const has = f => flags.includes(f) || target === f;
const ctx = pk.loadContext();
const list = (!target || target.startsWith('--') || target === 'all') ? pk.platforms() : [pk.get(target)];

function report(p) {
  const r = pk.check(p, ctx);
  console.log('\n== ' + p.title + ' (' + p.id + ')');
  r.errors.forEach(e => console.log('ERROR   ' + e));
  r.warnings.forEach(w => console.log('WARN    ' + w));
  r.missing.forEach(m => console.log('OWNER   needs ' + m.key + ' — ' + m.why));
  if (!r.errors.length && !r.missing.length) console.log('OK      ready to generate');
  return r;
}

let exit = 0;
if (cmd === 'list') {
  pk.platforms().forEach(p => console.log(p.id + '\t' + p.title));
} else if (cmd === 'validate') {
  for (const p of list) { const r = report(p); if (r.errors.length) exit = 1; }
  console.log('\n(OWNER lines are decisions only you can make; they are not failures of the repo.)');
} else if (cmd === 'generate') {
  for (const p of list) {
    try {
      const out = pk.generate(p, ctx, { allowIncomplete: has('--allow-incomplete') });
      const dir = path.join(__dirname, '..', 'packaging', 'out', p.id);
      for (const f of out.files) {
        const dest = path.join(dir, f.path);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, f.content);
        console.log('wrote   packaging/out/' + p.id + '/' + f.path + (out.missing.length ? '  (DRAFT: owner inputs missing)' : ''));
        if (has('--install') && (p.installable || []).includes(f.path)) {
          if (out.missing.length) { console.log('skip    --install refused: draft output'); continue; }
          const target = path.join(__dirname, '..', f.path);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, f.content);
          console.log('install ' + f.path);
        }
      }
      out.warnings.forEach(w => console.log('WARN    ' + w));
    } catch (e) { console.log('FAIL    ' + p.id + ': ' + e.message); exit = 1; }
  }
} else {
  console.log('usage: node tools/package.js list | validate [platform|all] | generate [platform|all] [--allow-incomplete] [--install]');
  exit = 2;
}
process.exit(exit);
