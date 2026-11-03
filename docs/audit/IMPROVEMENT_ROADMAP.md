# Improvement Roadmap — KINGCODE IDE

Proposed implementation sequence **awaiting approval**. Derived only from verified findings in the other audit files. Supersedes `DEVELOPMENT_ROADMAP.md` and `FEATURE_MATRIX.md` (kept as history; both predate current code).

## Principles
Preserve working code; one logical change per commit; every fix ships with a regression test and a CHANGELOG entry; every asset change bumps SW cache version + `KC.version` + `package.json` together (existing rule); no new runtime dependencies.

## Phase 1 — Data integrity (Critical/High first)
| Order | Fix | Findings | Test |
|---|---|---|---|
| 1.1 | Central write path with invariants (unique names, caps, size limits) | F-01, F-04, A-02 | import 61/100 files, dup names, array input, non-string content |
| 1.2 | Persist failure surfaced persistently; no false "Saved" | F-02 | quota-fill E2E |
| 1.3 | Flush persist on `pagehide`/`visibilitychange` | F-03 | edit→reload @0 ms |
| 1.4 | Make auto-save-off real (saved snapshot) or remove the toggle — **needs your decision** | F-05 | autosave-off E2E |
| 1.5 | Update flow: flush before reload, or user-initiated "Reload" | F-07 | SW update E2E |
| 1.6 | SW deletes only `kingcode-cache-*` | F-06 | cache-isolation test |
| 1.7 | Clean HTML export (no bridge) | F-08 | export content test |

## Phase 2 — Security hardening
Remove inline handlers → drop `'unsafe-inline'` from shell `script-src`; allow-list/cap bridge messages; add referrer meta; document host headers; decide preview network policy (**decision needed**: keep fully offline/blocked, or allow https images/fetch in preview). Tests: sandbox probe, forged message, CSP behavior.

## Phase 3 — Architecture (incremental, no rewrite)
Storage adapter (async, localStorage first, IndexedDB second) → VFS with folders → ES modules (no bundler) → split `ui.js` → pure preview builder. Each step independently shippable.

## Phase 4–5 — Core IDE + UI/UX
Folders in explorer, file search, multi-page preview + asset resolution, refresh/error states, editor Tab-escape/accessibility, `aria-label`s, startup toast removal, phone layout redesign (not a shrunk desktop), empty/loading/error states. **Terminal:** none exists — stays absent; document the safe architecture (WebContainers/remote sandbox for web; native PTY via Tauri/Electron; Android via remote/proot) in the platform doc rather than faking a shell. **Git:** absent — document strategy (isomorphic-git over the VFS + token via secure storage).

## Phase 6 — Performance (measure before/after)
Baseline: startup time, 100 k-line edit (≈300 ms), 1.4 MB state serialize per debounce. Targets: per-file storage records in IndexedDB; incremental persist; measure with Playwright tracing. No claims without numbers.

## Phase 7 — Testing
Per TESTING_AUDIT: `node:test` units, Playwright E2E for the 16 workflows, security tests, CI job + traces, lint (decision: ESLint devDependency vs zero-dep checks).

## Phase 8 — Platform strategy (docs only)
`docs/architecture/MULTI_PLATFORM_STRATEGY.md`: Android (Capacitor/TWA vs React Native/Expo), Windows (Tauri vs Electron, MSIX/Store), shared core = VFS + Storage adapter + Commands, AI orchestration as a separate service layer, auth/sync, extension model. Preliminary view: this codebase is a web app, so PWA→TWA (Play) and Tauri/WebView2 (Store) reuse it with no rewrite; React Native would discard the editor and is not justified yet.

## Phase 9–10 — Docs and final verification
README/CHANGELOG/CONTRIBUTING corrected (CDN claim, SW version, limits), `IMPLEMENTATION_PROGRESS.md` maintained throughout, `FINAL_ENGINEERING_REPORT.md`, full re-test, secret scan, diff review.

## Decisions requested from you
1. **Auto-save-off:** make it truly hold edits, or remove the setting?
2. **Preview network policy:** blocked (current) vs allow https images/fonts/fetch/scripts?
3. **Dev dependencies:** approve Playwright (and ESLint?) as devDependencies?
4. **ES modules migration** in Phase 3: approve (keeps no-build deployment)?
5. **PR/branch:** work stays on `claude/kingcode-ide-audit-modernize-a7ddks`; I will not open a PR unless you ask.
