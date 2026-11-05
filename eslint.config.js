/* =========================================================
 * kingCode — eslint.config.js (ESLint flat config)
 * التطبيق سكربتات عادية تتشارك globals (لا modules): نصرّح بها كقراءة فقط كي يلتقط no-undef أخطاء الكتابة
 * بين الملفات. ESLint أداة تطوير فقط (devDependency) ولا تُشحن مع التطبيق.
 * ========================================================= */
'use strict';
const js = require('@eslint/js');
const globals = require('globals');

/* globals التي يعرّفها كل ملف js/ (const على مستوى السكربت) */
const appGlobals = Object.fromEntries([
  'KC', 'U', 'STORE', 'STATE', 'EDITOR', 'FILES', 'FILE_LIST', 'TABS', 'PREVIEW', 'PreviewBuilder',
  'Commands', 'PALETTE', 'UI', 'APP', 'CodeMirror', 'BRIDGE', 'HUB', 'EXT_HOST'
].map(n => [n, 'readonly']));

const sharedRules = {
  'no-redeclare': ['error', { builtinGlobals: false }], /* كل ملف يعرّف const عامًا خاصًا به */
  'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-prototype-builtins': 'off',
  'no-useless-escape': 'warn'
};

module.exports = [
  { ignores: ['vendor/**', 'node_modules/**', 'docs/**', 'icons/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, ...appGlobals } },
    rules: sharedRules
  },
  {
    files: ['service-worker.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.serviceworker } },
    rules: sharedRules
  },
  {
    files: ['tools/**/*.js', 'bridge/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: sharedRules
  },
  {
    /* callbacks الممرَّرة إلى page.evaluate تعمل داخل المتصفح وترى globals التطبيق */
    files: ['tools/e2e.js', 'tools/perf.js', 'tools/make-screenshots.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser, ...appGlobals, kc: 'readonly' } },
    rules: sharedRules
  }
];
