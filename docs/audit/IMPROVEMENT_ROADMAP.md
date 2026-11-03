# Improvement Roadmap — KINGCODE IDE

_Originally the proposal approved at the end of Phase 0 (2026-11-03). Updated at the end of the effort with what was actually delivered. Evidence: `docs/engineering/FINAL_ENGINEERING_REPORT.md`, `CHANGELOG.md`._

## Delivered

| Phase | Result | Version |
|---|---|---|
| 1 — Data integrity | F-01…F-08 fixed with regression tests (import limits/validation, persistent failure state, flush on exit, real auto-save-off, SW cache scope, no auto-reload on update, clean export) | 1.0.7 |
| 2 — Security | Shell CSP without `'unsafe-inline'` scripts, preview in `sandbox.html` with its own CSP, bridge hardening, referrer policy, hosting-header guidance, `SECURITY.md` | 1.0.8 |
| 3 — Architecture | Single write path, pure `PreviewBuilder`, IndexedDB `STORE` (differential writes, migration, journal, fallback), virtual folders, `ui.js` split; **ES modules deliberately deferred (ADR-4)** | 1.0.9–1.3.0 |
| 4 — Core IDE | Folders, filter, path-aware preview, editor features verified (search/replace, comments, settings, large files), Alt+Arrow fix; terminal/Git confirmed absent and documented | 1.2.0–1.3.0 |
| 5 — UI/UX | Per-device layouts (phone single-pane + bottom nav, tablet drawer), accessibility fixes (names, roles, Tab trap, palette) | 1.2.0, 1.4.0 |
| 6 — Performance | Measured before/after (`docs/engineering/PERFORMANCE.md`): 0 ms main-thread blocking vs 1133 ms, ≈ 20× less data per edit; startup within noise | 1.1.0 |
| 7 — Testing | 19 static guards, 43 unit tests, 47 Chromium E2E tests (workflows, regressions, IndexedDB, folders, responsive, accessibility, security, real two-version SW update), ESLint, CI jobs `verify`/`lint`/`e2e` | 1.0.7–1.4.0 |
| 8 — Platform strategy | `docs/architecture/MULTI_PLATFORM_STRATEGY.md` (plan only) | docs |
| 9 — Documentation | README, CHANGELOG, CONTRIBUTING, SECURITY, ADRs, audit documents brought in line with the code | docs |

## Not delivered / next (priority order)

1. Real-device verification (Safari/iOS, Android WebView, installed-app mode). Firefox and WebKit (Playwright builds) are covered by CI since 1.4.2; real devices are **not tested**.
2. Product decisions in `MULTI_PLATFORM_STRATEGY.md` §7, then P1–P3 of its phased plan (stable origin with headers → Android TWA → Windows MSIX).
3. `FS` adapter (File System Access API) → Git → Tauri shell with a real terminal (none of these exist today).
4. Backend/proxy + threat model before any AI, authentication or sync.
5. CodeMirror 6 and ES modules, each as its own guarded project when a shell or extension system requires them.
6. Remaining quality items: colour-contrast and screen-reader review, memory profiling, multi-tab concurrency (`storage`/BroadcastChannel), committed lockfile.
