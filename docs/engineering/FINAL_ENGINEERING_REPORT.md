# Final engineering report — KINGCODE IDE foundation (v1.0.6 → v1.4.2)

_Baseline: commit `45f7284` (v1.0.6). Final: v1.4.2 (cross-browser CI added after the first final report; see CHANGELOG 1.4.2). Everything marked "verified" was run by me in this environment (Node v22, headless Chromium via Playwright, Linux container). Anything not verified is listed in §12._

## 1. Executive summary

The repository was a small, tidy vanilla-JS PWA whose earlier audit documents were largely stale (most listed bugs were already fixed). Verification against real browser behaviour found a different set of problems: **silent data loss** (imports truncated at 60 files, storage failures reported as "saved", edits lost on quick reloads, a fake "auto-save off"), **an editor that kept showing the old document after an import** (which could overwrite imported files), a service worker that reloaded the page and deleted other apps' caches, and **zero tests that executed application code**.

Over four phases I fixed those defects with a regression test each, moved persistence to IndexedDB with differential writes, hardened the security model (no inline scripts in the shell, preview isolated in its own CSP page), introduced a single write path for project files, added folders, rebuilt the phone/tablet layouts, and replaced "16 dev-server checks" with **19 static guards + 43 unit tests + 47 real-browser E2E tests + ESLint** in CI. No runtime dependencies were added.

Not done, by design or for lack of means: a real terminal, Git, AI, accounts, cloud sync, extensions (none existed; a plan is in `docs/architecture/MULTI_PLATFORM_STRATEGY.md`), the ES-modules migration (deliberately deferred, ADR-4), and any testing on real Safari/iOS, Android WebView or real phones (Firefox and WebKit are covered in CI since v1.4.2).

## 2. Initial repository condition (verified, `45f7284`)

- ~2,600 lines of app JS in 10 global scripts, CodeMirror 5 vendored, localStorage persistence, `srcdoc` preview with an inherited CSP, service worker, 16 smoke checks (dev server + version strings + two substring greps), a CI job running them.
- Earlier audit findings CB-01…CB-08, SC-01/04/08/09 were **resolved or stale** at this commit (re-verified); a few claims (theme toggle no-op, Ctrl+S conflict, delete race) did not reproduce.
- No test executed application code; no lint; no browser matrix; no unit tests.
- No terminal, Git, AI, folders or multi-project support — and the README did not claim any.

## 3. Defects discovered

| ID | Defect | Severity | Verified how |
|---|---|---|---|
| F-01 | Import/restore of > 60 files saved, then **silently truncated to 60** on reload (100 → 60) | High | Playwright import + reload |
| F-02 | Storage failure showed "✓ saved"; warning once per session | High | Filled storage, edited |
| F-03 | Edits within 250 ms of reload/navigation lost (no flush on exit) | Medium | Typed + reloaded |
| F-04 | Import accepted arrays; duplicate names after sanitizing; no count/size limits; silent blanking | Medium | Unit/E2E |
| F-05 | "Auto-save off" still persisted unsaved text on any later save | Medium | E2E |
| F-06 | Service worker deleted **every** other cache on the origin | Medium | Code + E2E with a foreign cache |
| F-07 | New service worker reloaded the page automatically (first visit and every update); startup "checking" toast | Medium | Code, benchmark (2 loads on first visit) |
| F-08 | Standalone HTML export contained the console bridge | Low | E2E |
| F-09 | README said CDN assets work in preview; the inherited CSP blocked them | Medium | E2E |
| **F-14** | **After import/restore the editor still showed the old document; the next keystroke overwrote the imported file** | **High** | E2E red on the old code |
| F-10–F-13 | Update toast noise; unnamed buttons/inputs, Tab keyboard trap, `role=option` misuse; palette capped at 14 results; tab limit unenforced; cramped phone layout; tablet drawer open on first run; drawer overlay without a handler | Low–Medium | DOM/E2E |
| **F-15** | **Crash journal could mix files into a project migrated from the old storage format** (found by the first GitHub CI run; local runs had passed 3×; reproduced deterministically, then fixed in 1.4.1 with unit + E2E regressions) | Medium | CI log → local reproduction |
| — | **Alt+→/← inside the editor did nothing** (two handlers cancelled each other) | Low | E2E red on the old handler |
| S-02/S-03/S-06 | Bridge `level` unrestricted and messages unbounded; shell needed `'unsafe-inline'` scripts because the preview inherited the CSP; no referrer policy | Low–Medium | Code + E2E |

Full evidence, reproduction steps and status: `docs/audit/*.md`. No Critical or High **security** defect was confirmed; the High items above are data-integrity defects.

## 4. Defects fixed

All of the above except the documented limitations in §12. Each has a regression test; for F-14 and the Alt+Arrow bug I ran the new test against the previous code and confirmed it failed before the fix. Releases: **1.0.7** (data integrity), **1.0.8** (security), **1.0.9** (write path, preview builder, F-14), **1.1.0** (IndexedDB), **1.2.0** (folders, a11y), **1.3.0** (split, lint, PWA/editor tests), **1.4.0** (responsive), **1.4.1** (crash-journal rules). Details per version in `CHANGELOG.md`.

## 5. Security improvements (verified by tests)

- Shell CSP: `script-src 'self'` (no `'unsafe-inline'`), `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`; all inline `onclick` removed.
- Preview moved to `sandbox.html` (opaque origin, own CSP `default-src 'none'`, no network) with a nonce handshake; verified blocked: parent DOM, storage, top navigation, `fetch`/WebSocket.
- Console bridge allow-listed and size-capped; forged messages ignored.
- Virtual paths sanitized per segment; import validation with user-visible notes; service-worker cache scope; no secrets in the repository (scan: only a path-traversal test fixture matched).
- Documented residuals: `style-src 'unsafe-inline'`, plaintext storage, shared-origin storage, headers a static host must set. See `SECURITY.md`, `docs/security/HOSTING_HEADERS.md`.

## 6. Architecture improvements

- **Single write path** (`STATE.addFile/renameFile/removeFile/addFolder/renameFolder/removeFolder/replaceProject`); `FILES` is UI only.
- **`STORE`** (`js/storage.js`): IndexedDB with per-file records and differential writes, localStorage fallback, legacy migration, crash journal; async serialized writes with retry.
- **Pure `PreviewBuilder`**, DOM-free and unit-tested; path-aware resolution (`./`, `../`, `/`).
- **Virtual file system** with folders; `ui.js` split into `commands.js` / `palette.js` / `ui.js`.
- Decisions recorded in `docs/architecture/DECISIONS.md` (ES modules **deferred** with reasons and revisit triggers; CodeMirror 5 kept; dev dependencies justified).

## 7. UI/UX improvements

Explorer tree with collapsible folders, filter box and keyboard model; per-device layouts (desktop three panes; tablet temporary drawer; phone single-pane with a labelled bottom nav, ≥ 44 px targets); every button/input has an accessible name; `Esc` leaves the editor so Tab is not trapped; palette shows all files and commands; actions float over rows instead of truncating names. Checked by E2E assertions on structure and by screenshots I reviewed; **visual polish, contrast ratios and screen-reader behaviour were not measured.**

## 8. Performance improvements (measured; `docs/engineering/PERFORMANCE.md`)

Same scenario, original vs final, median of 5 (20 files × ~126 KB, 20 edits):

| Metric | v1.0.6 | v1.4.0 (measured; 1.4.1 only changes crash-journal rules) |
|---|---|---|
| Main thread blocked while editing (ms) | 1133 | 0 |
| Data written per edit | 2,659,340 chars | 131,326 chars (≈ 20× less) |
| Startup to ready (ms) | 585 | 519 (within noise; not claimed as a speed-up) |
| Page loads on first visit | 2 | 1 |
| Edit in a 100k-line document (ms) | 10 | 9 (no difference) |

Capacity: a 16 MB project persists and reloads (the old blob could not hold it). Memory/leak profiling was **not** done.

## 9. Tests executed and exact results (final head, this environment)

| Command | Result |
|---|---|
| `npm test` (static guards + unit) | static **19/19**, unit core **32/32**, unit preview **11/11** — all PASS |
| `npx eslint .` | clean (0 errors, 0 warnings) |
| `node --check` on `js/*.js tools/*.js tools/unit/*.js service-worker.js eslint.config.js` | all OK |
| `npm run test:e2e` | **47/47 PASS** (see `IMPLEMENTATION_PROGRESS.md` for the run history; the first pull-request run on GitHub exposed one failure that local runs had not, described in §3 and §10) |
| Reference/precache check | 52 `index.html` references, 59 precached assets, all manifest icons exist; nothing missing |
| Secrets scan (regex over tracked non-vendor files) | no credentials; one fixture string (`/etc/passwd` in a traversal test) |
| Accidental deletions vs `45f7284` | none (19 added, 24 modified, 0 deleted/renamed) |

E2E coverage: launch/create/edit/save/reload; import/export/backup/restore; tabs; preview and runtime errors; responsive structure at phone/tablet/desktop; offline reload; **real two-version service-worker update**; IndexedDB backend, migration, journal recovery, localStorage fallback; folders; editor search/replace/comment/settings/50k-line file; accessibility; sandbox isolation and XSS probes. Two E2E tests I wrote originally had weak or wrong assertions (a `|| true`, a line-number selector); I corrected them rather than keeping them green.

## 10. CI status

- PR #1 (Phase 0–1): `verify` and `e2e` green on the merged head `f4f79ee`; merged as `b87083a`. A first push failed because I broke the workflow YAML (unquoted colon); fixed before merge.
- PR #2 (Phases 2–3 steps 1–2): `verify` and `e2e` green on head `0a2e75f`; merged as `6642011`.
- PR #3 first run (head `33f56f3`): `verify` ✅, `lint` ✅ (new job, passed first time), `e2e` ❌ 45/46 — `A-01 legacy migration`. Root cause: a partial crash journal written at page exit was merged into the migrated legacy project (real bug, F-15), exposed by timing that differs on the CI runner. Fixed in 1.4.1; **CI on the fixed head `6b229f8`: `verify` ✅, `lint` ✅, `e2e` ✅ (47/47)** — GitHub Actions run 41637991223. Later documentation-only commits re-trigger CI and are not separately recorded here.

## 11. Files changed (vs `45f7284`)

43 files, +3,677 / −1,911 (the deletions are mostly rewritten audit documents and refactored JS). Application: `index.html`, `sandbox.html` (new), `js/` (new: `storage.js`, `preview-builder.js`, `commands.js`, `palette.js`; reworked: `state.js`, `files.js`, `list.js`, `ui.js`, `app.js`, `editor.js`, `preview.js`, `utils.js`, `config.js`, `tabs.js`), `css/`, `service-worker.js`. Tooling: `tools/e2e.js`, `tools/perf.js`, `tools/unit/*`, `eslint.config.js`, `.github/workflows/ci.yml`, `package.json`. Docs: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/audit/*`, `docs/architecture/*`, `docs/security/*`, `docs/engineering/*`.

## 12. Remaining limitations (honest list)

- **Not tested:** real Safari/iOS, Android WebView, real phones/tablets (emulated viewports/touch only; Playwright's Firefox and WebKit builds on Linux run the full suite in CI since v1.4.2 — not the same as the shipping browsers on those devices), installed-app (standalone) mode, screen readers, colour contrast, memory use, multi-tab concurrent editing.
- **Not built (never existed):** terminal, Git/GitHub integration, AI assistant/agents, authentication, cloud sync, extensions/marketplace, Android/Windows packages. `docs/architecture/MULTI_PLATFORM_STRATEGY.md` is a plan; its statements about store policies and third-party tool versions are **my assessment and need verification** before anyone relies on them.
- **Deliberately deferred:** ES modules/bundler (ADR-4), CodeMirror 6 (ADR-5).
- **Known trade-offs:** preview has no network by design; `style-src 'unsafe-inline'`; plaintext local storage; IndexedDB flush on page exit is best-effort through a journal (tested for reload, not for every crash scenario); a deleted file can reappear after a crash that skips the journal (journal carries changes, not deletions); 60-file and 2,000,000-character limits; last-writer-wins across tabs.
- The `docs/audit/DEVELOPMENT_ROADMAP.md` and `FEATURE_MATRIX.md` files predate this work and are kept only as history.
- Baseline had no lockfile; `package-lock.json` was added in the re-audit branch (CI still uses `npm install`).

## 13. Recommended next development phase

1. **Get real-device evidence:** the suite already passes on Chromium, Firefox and WebKit in CI (v1.4.2); next test manually on an Android phone and an iPad (storage, `sandbox.html` handshake, service-worker update, installed mode).
2. **Decide product scope** (questions in `MULTI_PLATFORM_STRATEGY.md` §7), then ship the cheapest distribution step first (stable origin + headers → Android TWA / Windows MSIX from the PWA).
3. **Introduce the `FS` adapter** over the existing `STATE`/`STORE` seams (File System Access API on Chromium desktop) — prerequisite for Git and native shells.
4. Only then consider Git (isomorphic-git), a Tauri shell with a real PTY terminal, and — with a backend/proxy and a threat model first — AI and sync.
5. Plan CodeMirror 6 and ES modules as separate, test-guarded projects when a shell or extension system needs them.

## Addendum — cross-browser CI and store readiness (v1.4.2 → v1.5.0)

- **v1.4.2:** the E2E suite runs on Chromium, Firefox and WebKit (Playwright builds) in CI; the first matrix run found 7 failures (4 test-setup issues, a real IndexedDB `versionchange` robustness gap, a WebKit behaviour difference — masked `Script error.` — now explained to the user); all fixed, then 48/48 on all three engines.
- **v1.5.0:** store-readiness work for the PWA side (privacy page, screenshots, manifest, hosting headers, `npm run store:check`, `docs/store/`). Reviewing the generated screenshots exposed a real bug (explorer highlighted the wrong file after tab switches), fixed with a regression test confirmed red on the old code. **Nothing was submitted, built into an APK/AAB/MSIX, signed, deployed or tested on a device;** store policies and tool behaviour in `docs/store/` are my assessment and marked "verify". Remaining owner-only work: public origin, developer accounts, signing keys, device tests, Play feature graphic.

## Addendum — documentation & security re-audit (post-1.5.0, branch `ccr-8e98767f-hg3383`)

Full details: `docs/engineering/PHASE_0_AUDIT.md`, `/SECURITY_AUDIT.md`, `/IMPLEMENTATION_PROGRESS.md`. **Counts in §9 above are historical; current verified counts are static 19, unit 44 (32+12), E2E 50, `store:check` 53, ESLint clean** (executed again in this session; Chromium only for E2E).

- Corrections: "PR #3 pending" is obsolete (merged); stale 43-unit/47-E2E figures updated elsewhere; README rewritten where it contradicted the code (storage, limits, structure, deployment).
- New verified defect: live preview fails offline in Chromium (iframe sandboxed without `allow-same-origin` bypasses the service worker). A SW workaround was implemented, its test failed, and it was **reverted**; it remains open.
- Fixed: CI token permissions; 5 dev-only `npm audit` advisories via override.
- Not verifiable here: live deployment (unreachable; no matching Vercel project), Firefox/WebKit locally, real devices, store consoles.
- No GitHub Release exists for v1.5.0.
