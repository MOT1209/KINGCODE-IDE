# Implementation Progress

_Shared between agents (OpenCode / Claude Code). Update at every phase boundary._

## Completed phases
- **Phase 0 — Repository audit** (2026-11-03): complete. See `docs/audit/`.
- **Phase 1 — Data integrity** (v1.0.7): complete, merged to `main` via PR #1 (merge commit `b87083a`, CI green on the merged head).
- **Phase 2 — Security hardening** (v1.0.8): complete; PR #2 open, CI `verify` + `e2e` green on `dbfcaf1`; **not merged** (awaiting the user's explicit merge).
- **Phase 3 steps 1–2 — single write path + pure preview builder** (v1.0.9): complete locally (committed on the same branch; unpushed until the user decides on PR #2).

## Current phase
Phase 3 — Architecture. Remaining steps: async Storage adapter (localStorage first, IndexedDB second) → virtual filesystem with folders → ES modules (needs the user's go-ahead, decision 4) → split `ui.js`.

## Modified files (Phase 3, steps 1–2)
`js/state.js`, `js/files.js`, `js/preview.js`, `js/preview-builder.js` (new), `index.html`, `service-worker.js`, `js/config.js`, `package.json`, `.github/workflows/ci.yml`, `README.md`, `CHANGELOG.md`, `tools/e2e.js`, `tools/unit/{env,core.test,preview.test}.js` (new), `docs/audit/{ARCHITECTURE,TESTING,REPOSITORY}_AUDIT.md`.

## Fixed defects
- Phase 1: F-01 … F-08 (+ F-09 README claim). Phase 2: S-02, S-03, S-06.
- Phase 3: **F-14** editor showed old document after import/restore (found by the A-02 refactor; high severity), F-12 tab limit, preview fallback JS never executed, A-02 (write path), A-05 (pure builder), T-01 (unit + E2E coverage).

## Tests executed (2026-11-03, Node v22, Chromium via Playwright)
| Command | Result |
|---|---|
| `npm test` (static smoke + unit) | smoke 19/19, unit 15/15 + 8/8 PASS |
| `node --check` js/*.js tools/*.js tools/unit/*.js service-worker.js | all OK |
| `npm run test:e2e` | 20/20 PASS (3 consecutive local runs) |
| A-02 test against the pre-refactor code | FAIL as expected ("editor still shows old document") |
CI for the Phase 3 commits: not run yet (nothing pushed since PR #2's head).

## Remaining problems
F-10, F-11 (a11y), F-13 notes; A-01 (storage abstraction/quota), A-03 (VFS/folders), A-04 (ES modules), A-06 (split ui.js), A-07, A-08; T-02…T-08 (lint, browser matrix, PWA update E2E). Residual security: `style-src 'unsafe-inline'`; host-level headers; shared-origin storage.
Not tested: Safari/Firefox/iOS, installed-app mode, real two-version SW update.

## Known limitations
No terminal, Git, AI, folders, multi-project. Preview cannot reach the network by design. Storage still `localStorage` (~5 MB).

## Next actions
1. User decides on PR #2 (merge) and ES modules.
2. Storage adapter → VFS.
