# Implementation Progress

_Shared between agents (OpenCode / Claude Code). Update at every phase boundary._

## Completed phases
- **Phase 0 — Repository audit** (2026-11-03): complete. See `docs/audit/`.
- **Phase 1 — Data integrity** (v1.0.7): complete, merged to `main` via PR #1 (CI `verify` + `e2e` green on the merged head `f4f79ee`; merge commit `b87083a`).
- **Phase 2 — Security hardening** (v1.0.8): complete locally, tests green; PR pending.

## Current phase
Phase 3 — Architecture (not started): write path/storage adapter/VFS/ES modules per `docs/audit/IMPROVEMENT_ROADMAP.md`. Needs your go-ahead on ES modules (decision 4).

## Modified files (Phase 2)
`index.html`, `sandbox.html` (new), `js/preview.js`, `js/ui.js`, `js/app.js`, `js/config.js`, `service-worker.js`, `package.json`, `tools/e2e.js`, `tools/ci-smoke.js`, `CHANGELOG.md`, `docs/audit/SECURITY_AUDIT.md`, `docs/security/HOSTING_HEADERS.md` (new).

## Fixed defects
- Phase 1: F-01 … F-08 (+ F-09 README claim).
- Phase 2: S-02 bridge allow-list/caps · S-03 shell CSP without `'unsafe-inline'` scripts, preview isolated in `sandbox.html` · S-06 referrer + header docs.

## Tests executed (2026-11-03, Node v22, Chromium via Playwright)
| Command | Result |
|---|---|
| `npm test` | 19/19 PASS |
| `node --check` js/*.js tools/*.js service-worker.js | all OK |
| `npm run test:e2e` | 19/19 PASS (3 consecutive local runs) |
CI for Phase 2: pending (runs when the PR is opened).

## Remaining problems
F-10…F-13 (a11y, palette cap, minor), A-01…A-10 (architecture), T-02…T-08 (lint, browser matrix, PWA update E2E). Residual security notes: `style-src 'unsafe-inline'` (inline style attributes); host-level headers cannot be set by the app; shared-origin `localStorage` (S-07).
Not tested: Safari/Firefox/iOS (the sandbox.html handshake and document.write path are verified in Chromium only), installed-app mode, real two-version SW update.

## Known limitations
No terminal, Git, AI, folders, multi-project. Preview cannot reach the network by design. Storage still `localStorage` (~5 MB).

## Next actions
Open PR for Phase 2; then Phase 3 step 1 (single write path) → Storage adapter → VFS.
