/* =========================================================
 * kingCode — tools/unit/packaging.test.js
 * مولّدات التحزيم: التحقق، رفض المدخلات الناقصة/الأسرار، المخرجات، قابلية التوسع.
 * ========================================================= */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const pk = require('../packaging');
const { deriveVersion, findSecretKeys } = require('../packaging/common');

const FP = Array.from({ length: 32 }, (_, i) => (i * 7 % 256).toString(16).toUpperCase().padStart(2, '0')).join(':');
const complete = () => ({
  origin: 'https://app.example.test',
  android: { packageId: 'test.example.kingcode', keystorePath: '/keys/test.keystore', keyAlias: 'test', signingFingerprints: [FP] },
  windows: { identityName: 'Test.KingCode', publisher: 'CN=TEST-PUBLISHER', publisherDisplayName: 'Test Publisher' }
});
const ctxWith = config => pk.loadContext({ config });

test('committed packaging/config.json holds only owner-chosen values (no origin/keys/identity invented) and no secrets', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'packaging', 'config.json'), 'utf8'));
  assert.equal(cfg.origin, null);
  assert.equal(cfg.android.packageId, 'app.kingcode.ide'); /* chosen by the owner */
  assert.equal(cfg.android.keystorePath, null);
  assert.deepEqual(cfg.android.signingFingerprints, []);
  assert.equal(cfg.windows.publisher, null);
  assert.deepEqual(findSecretKeys(cfg), []);
});

test('registry discovers platforms and each implements the interface', () => {
  const ids = pk.platforms().map(p => p.id);
  assert.ok(ids.includes('android') && ids.includes('windows'));
  for (const p of pk.platforms()) for (const k of ['ownerInputs', 'validate', 'generate']) assert.equal(typeof p[k], 'function', p.id + '.' + k);
  assert.throws(() => pk.get('ios'), /unknown platform/);
});

test('versions: x.y.z -> monotonic android code and 4-part windows version', () => {
  assert.deepEqual(deriveVersion('1.5.1'), { semver: '1.5.1', code: 10501, win: '1.5.1.0' });
  assert.ok(deriveVersion('1.6.0').code > deriveVersion('1.5.99').code);
  assert.throws(() => deriveVersion('1.5'), /x\.y\.z/);
  assert.throws(() => deriveVersion('1.100.0'), /versionCode/);
});

test('real repo config: owner inputs are reported missing, generation refused, draft marked', () => {
  const ctx = pk.loadContext();
  for (const p of pk.platforms()) {
    assert.ok(pk.check(p, ctx).missing.length > 0, p.id);
    assert.throws(() => pk.generate(p, ctx), /owner inputs missing/);
    const d = pk.generate(p, ctx, { allowIncomplete: true });
    assert.ok(d.files.every(f => /<<OWNER:/.test(f.content)), p.id + ' draft not marked');
  }
});

test('android: complete config -> valid twa-manifest and assetlinks', () => {
  const ctx = ctxWith(complete());
  const a = pk.get('android');
  const r = pk.check(a, ctx);
  assert.deepEqual([r.errors, r.missing], [[], []]);
  const out = pk.generate(a, ctx);
  const twa = JSON.parse(out.files.find(f => f.path === 'twa-manifest.json').content);
  assert.equal(twa.packageId, 'test.example.kingcode');
  assert.equal(twa.host, 'app.example.test');
  assert.equal(twa.appVersionCode, ctx.version.code);
  assert.equal(twa.iconUrl, 'https://app.example.test/icons/icon-512.png');
  assert.equal(twa.maskableIconUrl, 'https://app.example.test/icons/icon-maskable-512.png');
  assert.equal(twa.signingKey.path, '/keys/test.keystore');
  const links = JSON.parse(out.files.find(f => f.path === '.well-known/assetlinks.json').content);
  assert.equal(links[0].target.package_name, 'test.example.kingcode');
  assert.deepEqual(links[0].target.sha256_cert_fingerprints, [FP]);
  assert.ok(!/<<OWNER/.test(JSON.stringify(out.files)));
});

test('android: rejects http origin, bad package id, malformed fingerprint', () => {
  const c = complete(); c.origin = 'http://x.test'; c.android.packageId = 'Bad Id'; c.android.signingFingerprints = ['abc'];
  const r = pk.check(pk.get('android'), ctxWith(c));
  assert.equal(r.errors.length, 3, r.errors.join('|'));
  assert.throws(() => pk.generate(pk.get('android'), ctxWith(c)), /https origin/);
});

test('windows: complete config -> options file; rejects publisher without CN=', () => {
  const ctx = ctxWith(complete());
  const w = pk.get('windows');
  const o = JSON.parse(pk.generate(w, ctx).files[0].content);
  assert.equal(o.version, ctx.version.win);
  assert.equal(o.publisher.commonName, 'CN=TEST-PUBLISHER');
  const bad = complete(); bad.windows.publisher = 'TEST';
  assert.match(pk.check(w, ctxWith(bad)).errors.join(), /CN=/);
});

test('secret-looking keys in the config are rejected for every platform', () => {
  const c = complete(); c.android.keystorePassword = 'x';
  for (const p of pk.platforms()) assert.match(pk.check(p, ctxWith(c)).errors.join(), /secret-looking key "android\.keystorePassword"/);
});
