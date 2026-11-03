# Testing Audit — KINGCODE IDE (Phase 0)

Audited commit `45f7284`, 2026-11-03.

## 1. Existing infrastructure (verified by running it)

| Item | Result |
|---|---|
| `npm test` → `tools/ci-smoke.js` | **16/16 PASS** (Node v22.23.4) |
| `node --check` on `js/*.js`, `tools/*.js`, `service-worker.js` | all OK |
| `.github/workflows/ci.yml` | syntax gate + `npm test` on push to `main` and every PR (Node 20, ubuntu). CI run status **not verified** (no GitHub Actions access used in Phase 0). |
| Linting | none configured |
| Unit / integration / E2E / PWA tests | none |
| Browser matrix | none |

What the 16 checks cover: dev-server behavior (malformed URL, traversal, CORS, MIME, home 200), version triple + CHANGELOG, presence of the string `Content-Security-Policy` and the exact sandbox attribute.

## 2. Gaps

| ID | Gap | Severity | Consequence |
|---|---|---|---|
| T-01 | **STATUS: addressed — 20 Chromium E2E tests (1.0.7–1.0.9) + 23 `node:test` unit tests (1.0.9).** **Zero tests execute application code.** State, files, import/export, tabs, preview, SW are untested in CI. | High | Every defect in REPOSITORY_AUDIT (F-01…F-08) passed the green suite. |
| T-02 | CSP/sandbox checks are substring greps, not behavior. | Medium | A broken policy would still pass; real behavior (blocked parent access) only verified by my manual probes. |
| T-03 | Test coverage is dev-server-centric, but the server is a dev tool, not the product. | Medium | Effort skew. |
| T-04 | No persistence/quota/reload tests. | High | F-01, F-02, F-03 undetected. |
| T-05 | No PWA/offline/update tests. | Medium | F-06, F-07 undetected. |
| T-06 | No responsive/visual or accessibility checks. | Medium | F-11, phone cramping undetected. |
| T-07 | No lint/format; no `.editorconfig`. | Low | — |
| T-08 | Docs claim "16 guards for security"; they guard the dev server only. | Low | Overstated. |

## 3. Proposed strategy (zero new runtime deps)

1. **Unit tests, Node built-in `node:test`** (no dependency) once `state/files/utils/preview-builder` are loadable in Node (needs the module step from ARCHITECTURE_AUDIT §4, or a tiny `vm`-based loader shim as an interim). Target: sanitizeFiles, hydrate normalization, import limits, name uniqueness, preview injection, bridge message validation.
2. **E2E with Playwright as a `devDependency`** — Chromium is already used in this audit. Justification: the app is entirely browser behavior; there is no honest way to test the 16 workflows without a browser. Maintenance: Microsoft, actively maintained; security: dev-only, never shipped; alternatives: Puppeteer (narrower), Cypress (heavier), WebdriverIO. Add as `npm run test:e2e`; CI installs browsers via the preinstalled/`npx playwright install chromium` step.
3. **Workflow suite** mapping 1:1 to the 16 required workflows: launch; create project/files; edit; save; reload & verify (including the F-03 fast-reload case); import; export; restore backup; tab switching; preview; preview error (`throw` in preview shows in console); responsive (390/820/1366, assert no horizontal overflow); offline reload; SW update (serve v1 then v2 from a test server, assert update prompt).
4. **Security tests:** sandbox isolation probe (parent/localStorage/top-nav blocked), forged-message rejection, filename XSS probe, dev-server tests (existing).
5. **Regression tests per fixed finding**, named by ID, added in the same commit as the fix (extends the existing CONTRIBUTING rule).
6. **Lint:** `eslint` flat config as devDependency (or `node --check` + a custom no-undef guard if the zero-dep rule is preferred — decision requested).
7. **CI:** add E2E job, upload Playwright traces on failure, run on Node 20 and 22.

## 4. Baseline reproduction probes used in Phase 0
Ad-hoc Playwright scripts (kept out of the repo, in the session scratchpad) covered: toolbar single-fire, edit→reload at 0/600 ms, hostile preview, forged postMessage, XSS file name, quota exhaustion, import with duplicate names, import of 100 files, restore backup, offline reload, SW cache names, three viewport sizes, autosave-off semantics. They become the seed of the E2E suite in Phase 7.
