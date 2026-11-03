# Implementation Progress

_Shared between agents (OpenCode / Claude Code). Update at every phase boundary._

## Completed phases
- **Phase 0 — Repository audit** (2026-11-03): complete. See `docs/audit/`.
- **Phase 1 — Data integrity** (2026-11-03): complete, v1.0.7. Approved by user with default recommendations (auto-save-off made real; preview stays network-blocked; Playwright as devDependency).

## Current phase
Phase 2 — Security hardening (not started). Phase 1 also covered roadmap items 1.1–1.7.

## Modified files (Phase 1)
`js/state.js`, `js/utils.js`, `js/files.js`, `js/editor.js`, `js/ui.js`, `js/app.js`, `js/preview.js`, `js/config.js`, `service-worker.js`, `css/main.css`, `package.json`, `.github/workflows/ci.yml`, `README.md`, `CHANGELOG.md`; new `tools/e2e.js`.

## Fixed defects (each has a regression test in `tools/e2e.js`)
F-01 import truncation · F-02 false "saved"/silent storage failure · F-03 unflushed persist · F-04 import validation · F-05 auto-save-off semantics · F-06 SW cache scope · F-07 auto-reload on update + startup toast · F-08 polluted HTML export. (F-09 README claim corrected.)

## Tests executed (2026-11-03, Node v22, Chromium via Playwright)
| Command | Result |
|---|---|
| `npm test` | 16/16 PASS |
| `node --check` js/*.js tools/*.js service-worker.js | all OK |
| `npm run test:e2e` | 15/15 PASS (3 consecutive clean runs) |
| e2e against pre-fix code | the fix-specific tests failed in the first clean run; later old-code runs were noisy (overlapping runs on a loaded machine), so only the first run is cited as evidence |
CI (GitHub Actions) status: not verified — workflow updated with an `e2e` job, first run pending after push.

## Remaining problems
F-10…F-13 (a11y, palette cap, minor), S-02…S-06 (CSP `unsafe-inline`, bridge message caps, referrer meta, host headers), A-01…A-10, T-02…T-08. Not tested: Safari/Firefox/iOS, installed-app mode, real two-version SW update path (F-07 covered by source + behavior checks only).

## Known limitations
No terminal, Git, AI, folders, multi-project. Preview cannot reach the network by design. Storage still `localStorage` (~5 MB).

## Next actions
Phase 2: remove inline handlers → drop `'unsafe-inline'`; allow-list/cap bridge messages; referrer meta; host-header docs.
