# Security

kingCode is a client-only PWA: there is no backend, no account, no analytics and no network call made by the application code. Everything below describes what is **implemented and tested** (see `tools/e2e.js`, `tools/unit/`, `tools/ci-smoke.js`) and what is **not**. Detailed findings: `SECURITY_AUDIT.md`. Decisions: `docs/architecture/DECISIONS.md`.

## Reporting a vulnerability

Please describe the impact and reproduction steps **privately** to the maintainer (GitHub: MOT1209) before opening a public issue. Include the app version (`KC.version`, shown in the status bar) and browser. There is no bug-bounty program.

## Threat model

- **In scope:** a user opens or pastes *untrusted project files* (HTML/JS/CSS/JSON) and previews them; a malicious file name or project JSON is imported; a page on the same origin or another origin tries to reach the app; the dev server is run on a developer machine.
- **Out of scope / not protected:** a compromised browser or extension, other applications sharing the same origin (see "Shared origins"), a compromised hosting provider (a malicious update would be cached by the service worker), physical access to an unlocked device.

## Controls (implemented)

| Area | Control | Verified by |
|---|---|---|
| Preview isolation | Preview runs in `sandbox.html` inside `<iframe sandbox="allow-scripts allow-modals">` (opaque origin, no `allow-same-origin`, no top-navigation, no popups/forms); parent DOM, storage and navigation are unreachable | E2E `SEC: preview sandbox…` |
| Preview network | Preview CSP `default-src 'none'` + inline script/style + `data:`/`blob:` images: no `fetch`/XHR/WebSocket, no remote scripts/images/fonts | E2E `S-03: preview still runs inline scripts but has no network` |
| Shell CSP | `script-src 'self'` (no `'unsafe-inline'`/`'unsafe-eval'`), `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`; no inline event handlers | smoke + E2E `S-03: shell blocks inline script execution` |
| Messaging | Preview→shell messages are accepted only from the preview frame's `contentWindow`, with an allow-listed `level`, ≤ 20 parts × 2,000 chars; shell→preview render messages carry a per-render nonce | E2E `S-02`, forged-message test |
| DOM sinks | File names, console text, tabs, toasts use `textContent`; the palette escapes HTML; only constant strings reach `innerHTML` | E2E hostile-file-name test |
| Project paths | Virtual paths are sanitized per segment (`U.safePath`): no `.`/`..`/empty segments, depth ≤ 8, length ≤ 200; they never touch a real file system | unit tests |
| Imports | JSON must be an object; counts, sizes and names are validated; changes are reported before the user confirms; a backup is taken first | unit + E2E |
| Data at rest | Project data lives only in the browser's IndexedDB (localStorage fallback) | — |
| Service worker | Deletes only `kingcode-cache-*` caches; updates are applied only on user action | E2E `F-06`, two-version update test |
| Dev server | Binds `127.0.0.1`, rejects malformed URLs (400) and root traversal (403), no wildcard CORS | `npm test` |
| Dependencies | Zero runtime dependencies; dev-only tooling (Playwright, ESLint) is never loaded by the app | `package.json`, ADR-6 |

## Known limitations (not defects, not fixed)

- **Shared origins.** IndexedDB/localStorage are shared by every page on the same origin. On `user.github.io` other projects can read kingCode data. Use a dedicated origin or custom domain for sensitive work.
- **Plaintext storage.** Project files are not encrypted at rest.
- **Style policy.** `style-src 'unsafe-inline'` remains because the UI uses inline `style` attributes.
- **Headers a static app cannot set.** `frame-ancestors`/`X-Frame-Options`, `Permissions-Policy`, HSTS must be set by the host (`docs/security/HOSTING_HEADERS.md`); GitHub Pages cannot set them.
- **Offline preview.** The live preview (iframe sandboxed without `allow-same-origin`) does not load offline in Chromium because such navigations bypass the service worker (reproduced; `SECURITY_AUDIT.md` F-02). Editing and storage work offline.
- **Multi-tab.** Two tabs editing the same project are last-writer-wins.
- **Browser coverage.** The security and storage E2E tests run in CI on Playwright's Chromium, Firefox and WebKit builds (Linux). That is not the same as real Safari on iOS/macOS, Android WebView or installed-app mode, which remain untested.
- **CodeMirror 5** (vendored) is in maintenance mode; its exact version and advisory status were not independently verified.
- **Hosting headers** (`vercel.json`, `_headers`) are verified structurally only; they have never been served by a real host. After the first deployment, check them with `curl -sI` and confirm the preview still works (`docs/security/HOSTING_HEADERS.md`).
- **Future features.** There is no terminal, Git, AI or extension system. Before adding any of them, follow the threat-model rule in `docs/architecture/MULTI_PLATFORM_STRATEGY.md` §3 (secrets never in client storage, explicit user consent for writes, sandboxed extensions with declared permissions).
