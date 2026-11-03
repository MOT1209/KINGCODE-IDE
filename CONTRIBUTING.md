# Contributing to kingCode

مرحبًا بك! This guide lists the binding contribution rules — written to keep kingCode small, fast, secure, and auditable. It matches the code as of v1.4.x; if you change a rule, change this file in the same PR.

## 🚀 Local setup

```bash
npm run dev          # = node tools/server.js → http://localhost:8123/   (zero dependencies needed)
npm test             # static guards + unit tests — Node only, no install needed

# Optional, dev-only tooling (never shipped, never loaded by the app):
npm install                                  # eslint, @eslint/js, globals, playwright
npx playwright install chromium              # once, for the E2E suite
npm run lint                                 # ESLint
npm run test:e2e                             # 47 real-browser tests
npm run perf -- <git-ref>                    # benchmark current code vs a git ref (see docs/engineering/PERFORMANCE.md)
```

Requirements: Node ≥ 18. No frameworks, no build step — static files are served directly.

## 🧱 Non-negotiable principles

1. **Vanilla ES2022 scripts only, zero runtime dependencies, no runtime CDN.** Everything the app serves ships from the repository so offline mode keeps working. Anything vendored lives under `vendor/` with a written decision.
2. **Dev dependencies need a record.** A new `devDependency` must be added to the table in `docs/architecture/DECISIONS.md` (purpose, benefits, maintenance, security implications, alternatives) in the same PR.
3. **RTL first.** Every UI element must work with Arabic RTL before anything else. Use logical properties (`inset-inline-*`, `padding-inline-*`).
4. **Security before convenience.** Never weaken the shell CSP (no `'unsafe-inline'` scripts), the `sandbox.html` policy or the iframe `sandbox` attribute without an ADR in `docs/architecture/DECISIONS.md` and a matching test. Never put secrets in client code or in `localStorage`/IndexedDB.
5. **One write path.** Create/rename/move/delete of files and folders goes through `STATE` (`addFile`, `renameFile`, `removeFile`, `addFolder`, `renameFolder`, `removeFolder`, `replaceProject`). `FILES` is UI only. Persistence goes through `STORE`; document building through `PreviewBuilder` (pure, no DOM).
6. **Cache/version rule.** Any change to a served asset (`js/*`, `css/*`, `index.html`, `sandbox.html`, `manifest.json`, `icons/*`) requires, **in the same commit**: bump `KC.version` (`js/config.js`), `VERSION` (`service-worker.js`) and `version` (`package.json`); add the file to the precache list if it is new; add a `## [x.y.z]` entry to `CHANGELOG.md`. `npm test` fails if these disagree.
7. **Honest docs.** README, CHANGELOG and `docs/` describe what exists. Planned things are labelled as plans (see `docs/architecture/MULTI_PLATFORM_STRATEGY.md`). Never present the preview console as a terminal.

## 📏 Commit discipline (live-evidence rule)

- **One logical change per commit.** Conventional Commits: `fix:` / `feat:` / `docs:` / `chore:` / `ci:` / `refactor:` / `test:`.
- State the **reason and reference** (finding ID or issue), e.g. `fix(files): refuse silent truncation (F-01)`.
- **A fix ships with a regression test** that fails without it: unit test (`tools/unit/*.test.js`, `node:test`) when the code is DOM-free, otherwise an E2E test in `tools/e2e.js`. Verify the test is red on the old code before claiming the fix.
- Claiming a test passes without the exact command and its real output is not acceptable.
- Keep `npm test`, `npm run lint` and `npm run test:e2e` green before requesting review. CI runs all three (`verify`, `lint`, `e2e`).

## 🪡 PR checklist

- Size: aim for ≤ 400 changed lines of code per PR (tests/docs excluded) and one architectural target.
- PR description: what / why / how / test commands with real results / what is *not* tested (browsers, devices).
- Link the related issue (`Fixes #nn`) or audit finding.
- Updated `CHANGELOG.md` (+ docs when behaviour changes).

## 🧪 Manual review matrix

Verify on desktop, tablet and phone sizes, in dark and light themes (the E2E suite covers layout structure, not visual polish):

| Check | Why |
|---|---|
| Clean console | no errors/warnings while editing and navigating |
| RTL integrity | editor and preview render correctly with `dir="rtl"` |
| Live preview | HTML/CSS/JS edits refresh the preview; runtime errors appear in the console panel |
| Import/export/restore | valid project round-trips (including folders); malformed JSON fails with a clear message |
| Offline + update | works after disconnecting; the "update ready" flow does not interrupt editing |
| Keyboard only | tree navigation, palette, `Esc` leaves the editor, no focus trap |
| Other browsers | Firefox and Safari/iOS are **not** covered by automation — test manually when touching storage, `sandbox.html` or the service worker |

## 🐞 Reporting bugs and requesting features

- Use the **bug report** / **feature request** templates.
- Include: app version (status bar / `KC.version`), browser and OS, steps to reproduce, actual vs expected.
- Audit context lives in `docs/audit/` and decisions in `docs/architecture/DECISIONS.md` — read the relevant ones first. Security issues: describe the impact and reproduction privately to the maintainer before opening a public issue.

## 📜 License

By contributing you agree your contributions are released under the MIT License (`LICENSE`).
