# Security Audit — KINGCODE IDE (Phase 0)

Audited commit `45f7284`, 2026-11-03. Threat model: a user opens untrusted project files (import/paste) in a client-only PWA; the dev server is localhost-only. There is no backend, no auth, no secrets, no network calls from app code.

## Summary

| ID | Title | Severity | Status |
|---|---|---|---|
| S-01 | Preview isolation (sandbox without `allow-same-origin`) | — | **Verified holding** |
| S-02 | Console bridge messages | Low | Mitigated; hardening open |
| S-03 | CSP: `'unsafe-inline'` scripts; inherited by preview | Medium | Open (design decision) |
| S-04 | SW deletes other apps' caches | Medium | Open (= F-06) |
| S-05 | Import validation gaps | Medium | Open (= F-04) |
| S-06 | Missing headers possible only via host (no meta equivalents) | Low | Open / document |
| S-07 | Data at rest: project in plaintext `localStorage` | Info | Accepted, document |
| S-08 | Dev server | — | **Previously reported issues resolved** |
| S-09 | Dependencies | Info | CM5 vendored; advisories unverified |
| S-10 | XSS via file names / content in app chrome | — | **Verified holding** |

No Critical or High security defect was confirmed.

## Verified-holding controls (evidence)

**S-01 Preview isolation.** Iframe has `sandbox="allow-scripts allow-modals"` (no `allow-same-origin`, no `allow-top-navigation`, no popups/forms). Hostile preview script (probe2): `window.parent.document` → blocked, `localStorage` → blocked, `window.top.location = …` → blocked, `fetch('https://example.com')` → blocked by inherited CSP.

**S-10 App-chrome XSS.** File named `<img src=x onerror=window.__xss=1>.html` is sanitized (`<>` → `-`) and rendered via `textContent`; `window.__xss` stayed undefined (probe1). Palette uses `escapeHtml` + `innerHTML` on fixed templates; tabs/list/console/toasts use `textContent`. `innerHTML` is used for the mobile quickbar/burger with constant strings only.

**S-08 Dev server.** `/%`→400, traversal→403 with no existence oracle, no ACAO header, correct MIME (all in `npm test`, 16/16). Binds `127.0.0.1` by default. Remaining nit: serves the entire repo root (including `docs/`, `.git/` if present) — acceptable for localhost dev, document it.

## Findings

### S-02 — Console bridge (Low)
- **Description:** bridge posts with `targetOrigin '*'`; parent accepts messages where `d.__kingcode === true` and `e.source === frame.contentWindow`.
- **Evidence:** forged `window.postMessage({__kingcode:true,…})` from the parent page was ignored (probe1 `forged:false`). Sandboxed frame has an opaque origin and the only listener reachable is its parent, so `'*'` leaks nothing sensitive.
- **Residual:** content of messages is untrusted (preview code controls `level`/`parts`): rendered via `textContent`, `level` is used in a CSS class name (`lvl-` + level) — constrain to an allow-list; `parts` length/size is unbounded per message (console flood: only row count is capped).
- **Fix:** allow-list `level`; cap parts count/length; keep `'*'` with a comment explaining why it is safe.
- **Verify:** unit test with malformed/oversized messages.

### S-03 — CSP weaknesses and preview side-effects (Medium)
- **Evidence:** `script-src 'self' 'unsafe-inline'` is required only by 8 inline `onclick="…"` attributes in `index.html`; `frame-src 'none'` is declared yet the `srcdoc` preview works (srcdoc frames are not governed by it as tested in Chromium — behavior should not be relied on across browsers; unverified in Firefox/Safari). Because `srcdoc` inherits the parent's CSP, **user projects cannot load any remote image, font, script or API** (F-09), and inline scripts in user projects only work because of `'unsafe-inline'`.
- **Impact:** weaker XSS defense-in-depth for the app shell; product limitation for previews.
- **Fix:** (1) remove inline handlers → drop `'unsafe-inline'` from `script-src` for the shell; (2) give the preview its own policy: serve preview from a `blob:`/`srcdoc` document that carries its own `<meta>` CSP (e.g. `img-src * data: blob:`, `connect-src https:`) — note inheritance means parent CSP must permit `blob:`/`frame-src`; alternative is a dedicated sandbox origin page (`/sandbox.html`). Needs a decision on whether network access from previews is wanted.
- **Verify:** Playwright test: shell has no inline script execution; preview loads a data:/https image per chosen policy.

### S-04 — Cache deletion scope (Medium) — see F-06.

### S-05 — Import validation (Medium) — see F-04. Extra security-relevant notes: names are sanitized for path characters (`\ / : * ? " < > | # % &`), leading dots stripped, length 64; `__proto__`/`constructor` keys are harmless (`Object.entries` over `JSON.parse` output, objects created with literals) but there is no prototype-pollution test.

### S-06 — Headers only a host can set (Low)
`frame-ancestors`, `X-Frame-Options`, `Referrer-Policy` (meta works for referrer), `Permissions-Policy`, HSTS cannot be set via `<meta>` CSP. App has no clickjacking protection when hosted statically. **Fix:** add `<meta name="referrer" content="no-referrer">`; document recommended host headers (`_headers` for Netlify/Cloudflare, `vercel.json`) in `docs/`.

### S-07 — Local storage (Info)
Project content and backup are plaintext in `localStorage` (same-origin scripts, browser extensions, and shared-origin hosting like `user.github.io` can read them). Sharing an origin with other apps on GitHub Pages is the realistic exposure. Document; consider dedicated origin/custom domain.

### S-09 — Dependencies (Info)
Zero npm dependencies (verified `package.json`). CodeMirror 5 is vendored; version claimed 5.65.16, **not independently verified** and CM5 is in maintenance mode. No SRI needed (same-origin). No GitHub Actions secrets are used; `actions/checkout@v4`/`setup-node@v4` pinned by tag, not by SHA (Low supply-chain note).

### Secrets scan
`grep` for `key|token|secret|password|api` across tracked files (excluding vendor): no credentials. GitHub secret scanning to be re-run in Phase 10.

## Open limitations to document (not defects)
- No terminal/Git/AI means no credential storage exists yet. **Before adding AI/GitHub**: tokens must not live in `localStorage` in plaintext; design in `docs/architecture/MULTI_PLATFORM_STRATEGY.md`.
- Offline-first means a malicious update via compromised host would be cached by SW; consider SW update UX + integrity docs.
