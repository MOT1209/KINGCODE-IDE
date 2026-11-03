# Security audit — KINGCODE IDE

_Audited commit `fd445f2` (v1.5.0), 2026-11-03, plus the changes in this branch (CI permissions, dev-dependency override). Method: source reading, the existing automated tests, one new probe (see F-02), `npm audit`. Items marked **not verified** could not be checked in this environment. Policy statement: `SECURITY.md`. Previous audit (v1.0.6): `docs/audit/SECURITY_AUDIT.md`, historical._

**Scope & threat model.** Client-only PWA: no backend, accounts, secrets, analytics or network calls from app code. A user may open untrusted project files and preview them. Dev server is localhost-only.

**Result: no Critical or High finding. 1 Medium (open), 3 Low, several Info.**

## 1. Findings

| ID | Title | Severity | Status |
|---|---|---|---|
| F-02 | Live preview fails offline (sandboxed iframe bypasses the service worker) | Medium (availability, not confidentiality) | **Open** — fix attempted, did not work, reverted |
| F-03 | CI workflow had default token permissions | Low | **Fixed** (this branch): `permissions: contents: read` in `.github/workflows/ci.yml` |
| F-04 | 5 moderate `npm audit` advisories (`minimatch` ReDoS via ESLint, dev-only) | Low | **Fixed** (this branch): `overrides.minimatch ^11.0.4`; `npm audit` → 0; `eslint .` clean |
| F-05 | SW caches every same-origin 200 navigation under its full URL (query variants add entries) | Low | **Open**, from code reading, not exercised |
| F-06 | Shell `style-src 'unsafe-inline'` | Low | **Accepted residual** (inline `style=` attributes); scripts are strict |
| F-07 | Project data stored unencrypted in IndexedDB; shared by every page on the same origin | Info | **Accepted**, documented in `SECURITY.md` |
| F-08 | Security headers exist as config only; never observed on a live host | Info | **Unverified** (no reachable deployment) |
| F-09 | CI actions pinned by tag (`@v4`), not SHA; CI uses `npm install` | Info | Partly fixed: `package-lock.json` now committed; SHA pinning and `npm ci` still open |
| F-10 | CodeMirror 5 vendored (version string 5.65.16 confirmed in the bundle); maintenance mode; no advisory database check possible offline | Info | Open |

Previously reported S-01…S-10 re-verified: see `docs/engineering/PHASE_0_AUDIT.md` §4.

### F-02 — Preview offline failure (evidence)
- Steps: load app on the dev server, reload so the SW controls the page, `context.setOffline(true)`, call `kc.PREVIEW.refresh()`.
- Observed (Chromium 1243 via Playwright 1.63): `page.frames()` → `[app, 'chrome-error://chromewebdata/']`; `fetch('sandbox.html?n=abc')` from the page → `200` (cache hit through the SW).
- Cause: iframe is `sandbox` without `allow-same-origin`; the navigation request is not given to the service worker. `sandbox.html` is precached, but the request URL carries a per-render nonce, and the browser's HTTP cache will not satisfy it offline.
- Attempted fix: SW branch answering `*/sandbox.html` with `caches.match('sandbox.html', {ignoreSearch:true})` on network failure, with an E2E test. Test **failed with the fix applied** → change reverted; nothing shipped.
- Impact: no confidentiality/integrity impact. The app promises offline use; edit/save/files work, preview and console do not.
- Second attempt (also reverted): `preview.js` fetched `sandbox.html` (cache-served offline) and loaded it as a `data:` iframe document. Chromium made that document **inherit the shell's `script-src 'self'`**: the bootstrap inline script was blocked (console: "Executing inline script violates … 'script-src 'self''") and 7 E2E tests failed. Working around it would require weakening the shell CSP, which is not acceptable. `srcdoc`/`blob:` inherit the parent CSP for the same reason.
- Remediation options (each needs its own test, none done): (a) load the sandbox with a fixed URL and pass the nonce by `postMessage` so an HTTP-cacheable/`Cache-Control` response can be reused (hosts must send a cacheable header for `/sandbox.html`); (b) ~~`data:`/`blob:`/`srcdoc` shell~~ — tried/ruled out (inherits parent CSP, see above); (c) accept and document. Not verified: Firefox/WebKit/installed mode.

## 2. Control-by-control review

| Area | Result | Evidence |
|---|---|---|
| **CSP (shell)** | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'` (meta in `index.html`). No inline scripts, no eval | `index.html:9`; E2E `S-03: shell blocks inline script execution` PASS |
| **CSP (preview)** | `sandbox.html` meta: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; …` — user code runs but has no network | E2E `S-03` ×2 PASS |
| **HTTP headers** | `vercel.json` / `_headers`: nosniff, `Referrer-Policy: no-referrer`, Permissions-Policy (camera/mic/geo/payment/usb off), HSTS 1y, one `frame-ancestors 'self'` rule, no-cache for SW and manifest | `npm run store:check` PASS (structure only). Live host: **not verified** |
| **XSS / DOM sinks** | `innerHTML` used in `palette.js:85` (all dynamic values via `U.escapeHtml`, `it.icon` is a constant from the command registry) and `ui.js:433` (constant string). No `eval`, `new Function`, `document.write` outside the sandbox page | grep + E2E hostile-file-name test PASS |
| **Input validation** | Import validation, path sanitising, limits (60 files, 2,000,000 chars, depth 8) | unit + E2E PASS |
| **URL actions** | `?action=` accepts only `new-file` / `preview`; URL is cleaned afterwards | `js/app.js:119` |
| **postMessage** | Origin is opaque so `'*'` is used; receivers check `e.source`, `__kingcode`, nonce; console payload capped | E2E `SEC`, `S-02` PASS |
| **Storage** | IndexedDB with localStorage fallback; no cookies (checked by `store:check`) | tests |
| **Service worker** | Only `kingcode-cache-*` deleted; no `skipWaiting` on install; GET http(s) only. Caveats F-02, F-05 | E2E `F-06`, `F-07`, update test PASS |
| **Auth / authorization** | Not implemented (not needed today) | — |
| **Secrets / env vars** | No secrets, no `.env`, no tokens in tracked files (regex scan, only a `/etc/passwd` string in a test fixture); CI uses no secrets | scan |
| **External resources** | None at runtime (`store:check`: no network calls other than SW) | PASS |
| **Browser permissions** | No camera/mic/geolocation/notifications API use; Permissions-Policy denies them at the host | grep + config |
| **Dependencies** | 0 runtime. Dev: `npm audit` → 0 after override | command output |
| **Dev server** | binds 127.0.0.1; traversal → 403; malformed URL → 400 | `npm test` |

## 3. Tests supporting this audit (executed here)

`npm test` 19 + 32 + 12 + 53 PASS; `npx eslint .` clean; `npm run test:e2e` Chromium 50/50 PASS. Firefox/WebKit not run here (download blocked); CI on `fd445f2` ran them green.

## 4. Limitations that cannot be resolved by this project
Same-origin sharing of IndexedDB on shared hosts (use a dedicated origin); GitHub Pages cannot send headers; a compromised host could ship a malicious update to an offline-cached app; real Safari/iOS and Android WebView are untested.

## 5. Before adding terminal / Git / AI / sync
Threat-model first; credentials never in IndexedDB/localStorage in plaintext; OAuth with PKCE; explicit user consent for writes (`docs/architecture/MULTI_PLATFORM_STRATEGY.md`).
