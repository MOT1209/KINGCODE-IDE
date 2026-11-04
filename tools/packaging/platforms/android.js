/* منصة Android — Trusted Web Activity عبر Bubblewrap/PWABuilder.
   أسماء حقول twa-manifest.json مأخوذة من معرفتي بـ Bubblewrap ولم تُتحقَّق من وثائقه الحالية: شغّل `bubblewrap init --manifest` أو `bubblewrap validate` للتأكد. */
'use strict';
const { abs } = require('../common');

const PKG_ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const SHA256 = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

module.exports = {
  id: 'android',
  title: 'Android — Trusted Web Activity (Bubblewrap / PWABuilder)',

  /** مدخلات لا يستطيع غير المالك تقديمها */
  ownerInputs(ctx) {
    const a = ctx.config.android || {};
    const missing = [];
    if (!ctx.origin) missing.push({ key: 'origin', why: 'public HTTPS origin the app is served from' });
    if (!a.packageId) missing.push({ key: 'android.packageId', why: 'permanent Android application id (cannot change after publishing)' });
    if (!a.keystorePath) missing.push({ key: 'android.keystorePath', why: 'path to YOUR signing keystore (never committed)' });
    if (!a.keyAlias) missing.push({ key: 'android.keyAlias', why: 'alias of the signing key' });
    if (!Array.isArray(a.signingFingerprints) || !a.signingFingerprints.length) missing.push({ key: 'android.signingFingerprints', why: 'SHA-256 of the key that signs what users install (with Play App Signing: Google\'s app-signing certificate)' });
    return missing;
  },

  validate(ctx) {
    const errors = [], warnings = [];
    const a = ctx.config.android || {};
    if (ctx.origin && !/^https:\/\/[^/\s]+$/.test(ctx.origin)) errors.push('origin must be an https origin without a path (e.g. https://app.example.com)');
    if (a.packageId && !PKG_ID.test(a.packageId)) errors.push('android.packageId is not a valid application id: ' + a.packageId);
    for (const f of a.signingFingerprints || []) if (!SHA256.test(f)) errors.push('fingerprint is not an upper-case colon-separated SHA-256: ' + f);
    const icons = ctx.manifest.icons || [];
    if (!icons.some(i => /512x512/.test(i.sizes) && i.purpose === 'maskable')) errors.push('manifest needs a 512x512 maskable icon');
    if (!icons.some(i => /512x512/.test(i.sizes) && i.purpose === 'any')) errors.push('manifest needs a 512x512 "any" icon');
    if (!ctx.manifest.screenshots || !ctx.manifest.screenshots.length) warnings.push('manifest has no screenshots');
    if (a.keystorePath && /^(\.|[^/~])/.test(a.keystorePath) && !/^\.\.\//.test(a.keystorePath) && !a.keystorePath.startsWith('/') && !a.keystorePath.startsWith('~')) warnings.push('keystorePath is inside the repository; keep keystores outside it (and out of git)');
    return { errors, warnings };
  },

  generate(ctx) {
    const a = ctx.config.android || {}, m = ctx.manifest;
    const startPath = '/' + String(m.start_url || './').replace(/^\.?\//, '');
    const icon = p => (m.icons.find(i => /512x512/.test(i.sizes) && i.purpose === p) || {}).src;
    const twa = {
      packageId: a.packageId,
      host: ctx.origin && ctx.origin.replace(/^https:\/\//, ''),
      name: m.name,
      launcherName: m.short_name || m.name,
      display: m.display || 'standalone',
      orientation: 'default',
      themeColor: m.theme_color,
      navigationColor: m.theme_color,
      backgroundColor: m.background_color,
      enableNotifications: false,
      startUrl: startPath,
      iconUrl: ctx.origin && abs(ctx, icon('any')),
      maskableIconUrl: ctx.origin && abs(ctx, icon('maskable')),
      webManifestUrl: ctx.origin && abs(ctx, 'manifest.json'),
      appVersion: ctx.version.semver,
      appVersionCode: ctx.version.code,
      signingKey: { path: a.keystorePath, alias: a.keyAlias },
      fallbackType: 'customtabs',
      shortcuts: (m.shortcuts || []).map(s => ({ name: s.name, shortName: s.short_name, url: s.url, chosenIconUrl: ctx.origin && s.icons && s.icons[0] && abs(ctx, s.icons[0].src) })),
      generatorApp: 'kingcode-packaging'
    };
    const files = [{ path: 'twa-manifest.json', content: JSON.stringify(twa, null, 2) + '\n' }];
    if (a.packageId && (a.signingFingerprints || []).length) {
      files.push({
        path: '.well-known/assetlinks.json',
        content: JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: a.packageId, sha256_cert_fingerprints: a.signingFingerprints } }], null, 2) + '\n'
      });
    }
    return files;
  },

  /** مسار ملف يُنسخ إلى جذر المستودع بـ --install (يُنشر مع الموقع) */
  installable: ['.well-known/assetlinks.json']
};
