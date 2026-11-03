# Phase 0 — Repository & documentation audit

_Audited commit: `fd445f2` (`main`, v1.5.0), 2026-11-03. Every statement below was checked against the repository or a command run in this session; anything not checked is labelled._

## 1. Baseline state (verified)

| Item | Finding | Evidence |
|---|---|---|
| `main` head | `fd445f2`, identical to the starting commit of this work | `git rev-parse origin/main` |
| CI on `main` head | `verify`, `lint`, `e2e` (chromium/firefox/webkit) all **success** | GitHub Actions run 41690025826 |
| Earlier CI failure | Run 18 on `19818d9` failed (WebKit sidebar-transition timing in a test); fixed by `50357f8`, green in run 19 | Actions runs 18/19 |
| GitHub Releases | **None exist.** "v1.5.0" is a version string in `package.json`, `js/config.js`, `service-worker.js` and CHANGELOG, not a tagged release | `list_releases` → `[]` |
| Runtime dependencies | None. Dev-only: `playwright`, `eslint`, `@eslint/js`, `globals` | `package.json` |
| Lockfile | Not committed (CI uses floating `npm install`) | `git ls-files` |
| Deployment | `vercel.json` exists. The URL `https://kingcode-ide.vercel.app/` could **not** be reached from this environment (egress proxy returns 403) and no `kingcode-ide` project exists in the connected Vercel account (7 other projects listed) | `curl -I` → 403; Vercel `list_projects` |

## 2. Commands run in this session (baseline, before any change)

| Command | Result |
|---|---|
| `npm install` | OK; `npm audit`: 5 moderate (all dev-only, `minimatch` via ESLint) |
| `npm test` | static 19/19, unit core 32/32, unit preview 12/12, `store:check` 53/53 — PASS |
| `npx eslint .` | clean |
| `npm run test:e2e` (Chromium 1243 build, Playwright 1.63.0) | **50/50 PASS** |
| E2E on Firefox / WebKit | **Not run here**: browser downloads are blocked by the egress proxy (`cdn.playwright.dev`). Their last evidence is CI (run 41690025826) |

## 3. Document inventory and defects found

| Document | Problem | Severity |
|---|---|---|
| `SECURITY_AUDIT.md` | **Did not exist at the repo root.** The audit lives in `docs/audit/SECURITY_AUDIT.md`, written against commit `45f7284` (v1.0.6) | Medium |
| `IMPLEMENTATION_PROGRESS.md` | **Did not exist at the root**; `docs/engineering/IMPLEMENTATION_PROGRESS.md` stops at v1.4.2, says "not yet merged to main / PR #3 pending" (false: merged), and uses no status vocabulary | Medium |
| `docs/audit/SECURITY_AUDIT.md` | S-07 says project data is in plaintext `localStorage` (it is IndexedDB since 1.1.0); S-03/S-06 residuals outdated (hosting headers now exist); does not cover manifest, SW cache keys, privacy, store packaging | Medium |
| `README.md` | (a) Lists `localStorage` auto-save as the storage; (b) tree omits `commands.js`, `palette.js`, `sandbox.html`, `privacy.html`, `tools/*`; (c) section "حدود معروفة (الإصدار 1.0)" is stale and contains **duplicated and contradictory** bullets (says no ESLint, 60-file limit twice); (d) no testing matrix of what is verified vs. not, no status table (implemented vs planned), no version in the text, deployment section says "upload folder `kingcode/`" (no such folder); (e) claims offline works generally — see F-P0-1 | Medium |
| `docs/engineering/FINAL_ENGINEERING_REPORT.md` | Header says v1.0.6→v1.4.2; §9 reports 47 E2E / 43 unit; the actual count is 50 E2E / 44 unit; addendum covers 1.5.0 but numbers were not updated | Low |
| `docs/architecture/DECISIONS.md`, `docs/audit/IMPROVEMENT_ROADMAP.md`, `MULTI_PLATFORM_STRATEGY.md` P0 row | Same stale "43 unit / 47 E2E" counts | Low |
| `docs/audit/{FEATURE_MATRIX,DEVELOPMENT_ROADMAP}.md` | Self-declared historical/superseded (v1.0.3); kept as history | Info |
| `docs/store/*` | Accurate and appropriately hedged ("verify"). Missing: statement that there is no live deployment to point the stores at | Low |

## 4. Previously reported security issues — re-verified

| ID | Claim in old audit | Re-verification on `fd445f2` |
|---|---|---|
| S-01 preview isolation | holding | `sandbox="allow-scripts allow-modals"`, no `allow-same-origin`; E2E `SEC: preview sandbox…` PASS |
| S-02 console bridge | fixed | level allow-list + 20×2000 caps in `js/preview.js`; E2E `S-02` PASS |
| S-03 CSP | fixed | `index.html` CSP has `script-src 'self'`; E2E `S-03` ×3 PASS; sandbox page has own CSP |
| S-04 SW cache deletion | fixed | `activate` deletes only `kingcode-cache-*`; E2E `F-06` PASS |
| S-05 import validation | fixed | unit + E2E PASS |
| S-06 headers | "documented" | Now implemented as config in `vercel.json`/`_headers`; **never observed on a live host** |
| S-07 plaintext localStorage | "accepted" | Outdated: data is in IndexedDB (still plaintext) |

## 5. New findings from this audit

_Mapping to `SECURITY_AUDIT.md`: F-P0-1→F-02, F-P0-2→F-03, F-P0-3→F-04, F-P0-4→F-05, F-P0-5→F-09._

- **F-P0-1 (Medium, verified, unresolved): the live preview does not work offline in Chromium.** The preview iframe loads `sandbox.html?n=<nonce>`. With the app online and the service worker controlling the page, going offline and refreshing the preview leaves the iframe at `chrome-error://chromewebdata/`. A page-level `fetch('sandbox.html?n=abc')` offline *is* answered from the cache (200), so the service worker works; Chromium does not route navigations of an iframe sandboxed **without** `allow-same-origin` through the service worker. I tried a SW `ignoreSearch` handler plus an E2E test; the test failed with the fix in place, so the change was **reverted** and no code was shipped. Editing, files, tabs and persistence work offline (the E2E offline reload test passes); only the live preview (and its console) is affected. Not checked: Firefox, WebKit, installed-app mode. Remediation options are in `SECURITY_AUDIT.md` §5 and `IMPLEMENTATION_PROGRESS.md`.
- **F-P0-2 (Low, fixed): CI workflow had no `permissions:` block** (default token scope). Added `permissions: contents: read`.
- **F-P0-3 (Low, fixed): `npm audit` reported 5 moderate advisories** (GHSA-g3hv-75wg-m249, `minimatch` ReDoS, pulled in by ESLint). Dev-tooling only, never shipped. Fixed with an npm `overrides` entry (`minimatch ^11.0.4`); after reinstall `npm audit` → 0 vulnerabilities and `eslint .` still passes.
- **F-P0-4 (Low, from code reading, not exercised): the navigation branch of the service worker caches every same-origin 200 navigation under its full URL**, so query-string variants (`?action=…`) create extra entries. Bounded in practice; recorded, not changed.
- **F-P0-5 (Info): no lockfile** → CI installs floating dev-tool versions. Recommended to commit one; not done here to avoid pinning a Playwright version that differs from the CI browsers.
- **F-P0-6 (Info): no GitHub Release or tag exists**, so "baseline v1.5.0" cannot be checked against a release artifact.

## 6. Plan derived from the audit

1. Rewrite/restore the root `SECURITY_AUDIT.md` and `IMPLEMENTATION_PROGRESS.md` from verified facts; mark the old copies historical.
2. Modernise `README.md` and fix stale counts.
3. Apply only the two verified, low-risk remediations (F-P0-2, F-P0-3).
4. Record F-P0-1 as an open limitation with options (no unverified fix shipped).
5. Extend `MULTI_PLATFORM_STRATEGY.md` with the per-feature assessment (assessment only).
6. Final report with exact test evidence and what could not be run.

## 7. Agent coordination note

This work was done by a single agent (Claude Code) in one session. No OpenCode agent was available, so no independent second-agent review took place; CI on the pull request is the only independent check. This is stated so nobody mistakes self-review for the two-agent process the brief describes.
