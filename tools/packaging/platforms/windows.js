/* منصة Windows — MSIX عبر PWABuilder.
   أسماء حقول الخيارات من معرفتي بـ PWABuilder ولم تُتحقَّق من وثائقه الحالية؛ القيم المصدرية (identity/publisher) تأتي من Partner Center. */
'use strict';
const { abs } = require('../common');

module.exports = {
  id: 'windows',
  title: 'Windows — MSIX (PWABuilder)',

  ownerInputs(ctx) {
    const w = ctx.config.windows || {};
    const missing = [];
    if (!ctx.origin) missing.push({ key: 'origin', why: 'public HTTPS origin the app is served from' });
    if (!w.identityName) missing.push({ key: 'windows.identityName', why: 'Package/Identity/Name from Partner Center (Product identity)' });
    if (!w.publisher) missing.push({ key: 'windows.publisher', why: 'Package/Identity/Publisher ("CN=…") from Partner Center' });
    if (!w.publisherDisplayName) missing.push({ key: 'windows.publisherDisplayName', why: 'Publisher display name from Partner Center' });
    return missing;
  },

  validate(ctx) {
    const errors = [], warnings = [];
    const w = ctx.config.windows || {};
    if (ctx.origin && !/^https:\/\/[^/\s]+$/.test(ctx.origin)) errors.push('origin must be an https origin without a path');
    if (w.identityName && !/^[A-Za-z0-9.-]{3,50}$/.test(w.identityName)) errors.push('windows.identityName must be 3-50 chars of letters, digits, "." or "-": ' + w.identityName);
    if (w.publisher && !/^CN=.+/.test(w.publisher)) errors.push('windows.publisher must start with "CN=" (copy it exactly from Partner Center)');
    const icons = ctx.manifest.icons || [];
    if (!icons.some(i => /512x512/.test(i.sizes))) errors.push('manifest needs a 512x512 icon');
    warnings.push('Store submission uses the Store-signed package; any test certificate is for sideloading only and must not be committed');
    return { errors, warnings };
  },

  generate(ctx) {
    const w = ctx.config.windows || {}, m = ctx.manifest;
    const opts = {
      name: m.name,
      packageId: w.identityName,
      publisher: { displayName: w.publisherDisplayName, commonName: w.publisher },
      version: ctx.version.win,
      url: ctx.origin,
      manifestUrl: ctx.origin && abs(ctx, 'manifest.json'),
      startUrl: m.start_url,
      lang: m.lang,
      generatedBy: 'kingcode-packaging'
    };
    return [{ path: 'pwabuilder-windows-options.json', content: JSON.stringify(opts, null, 2) + '\n' }];
  },

  installable: []
};
