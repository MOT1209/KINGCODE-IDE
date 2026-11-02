# Contributing to kingCode

مرحبًا بك! This guide lists the binding contribution rules — written to keep kingCode small, fast, secure, and auditable.

## 🚀 Local Setup

```bash
npm install     # zero dependencies — installs nothing (CodeMirror is vendored in vendor/)
npm run dev     # official alias of: node tools/server.js
# open: http://localhost:8123/
npm test        # zero-dep suite: 16 audit regression guards
```

Requirements: Node ≥ 18. No frameworks, no build step — static files are served directly.

## 🧱 Non-Negotiable Principles

1. **Vanilla ES6+ only.** No frameworks. Any new library must be vendored locally under `vendor/`, with a written decision justifying size, value, and alternatives.
2. **Zero npm dependencies, no runtime CDN.** Everything the app serves must ship from the repository so offline mode keeps working.
3. **RTL first.** Every UI element must work correctly with Arabic RTL before anything else.
4. **Security before convenience.** The preview runs inside a sandboxed iframe; never weaken CSP or sandbox permissions without a documented architectural decision in `docs/`.
5. **Service Worker cache rule (CB-08).** Any change to a served asset (`js/*`, `css/*`, `index.html`, `manifest.json`, `icons/*`) requires bumping BOTH versions **in the same commit**:
   - `js/config.js` → `KC.version`
   - `service-worker.js` → `const VERSION = 'kingcode-v…'`
   - `npm test` fails automatically if the two versions and the CHANGELOG entry disagree.

## 📏 Commit Discipline (live-evidence rule)

- **One commit per fix/feature.** Conventional Commits: `fix:` / `feat:` / `docs:` / `chore:` / `ci:` / `refactor:`.
- The subject states the **reason and reference**, e.g. `fix(server): strict root boundary (CB-04)`.
- Claiming a test passes without including **the exact command and its real output** in the PR body is not acceptable. "Works on my machine" is not evidence.
- Keep `npm test` green before every commit. New recurring checks belong in `tools/ci-smoke.js` — that is how a bug becomes a permanent guard.

## 🪡 PR Checklist

- Size: **400 lines maximum**, and exactly one architectural target (one `js/` module, or one layer).
- PR description: what / why / how / manual test steps.
- Link the related issue (`Fixes #nn`) when one exists.
- Every shipped change comes with code + an honest test story + an updated `CHANGELOG.md` (+ docs when behavior changes).

## 🧪 Manual Review Matrix

Verify these on both desktop and mobile, in dark and light themes:

| Check | Why |
|---|---|
| Clean console | no errors/warnings while editing and navigating |
| RTL integrity | editor and preview render correctly with `dir="rtl"` |
| Live preview | HTML/CSS/JS edits refresh the preview |
| Export/import | valid project round-trips; malformed JSON fails with a clean message |
| Offline | the app still works after disconnecting (Service Worker) |
| `npm test` | 16/16 green before requesting review |

## 🐞 Reporting Bugs and Requesting Features

- Use the **bug report** template for defects and the **feature request** template for proposals.
- Always include: app version (`kingCode 1.0.x` from the status bar), browser and OS, steps to reproduce, actual vs expected behavior.
- Historical audit context lives in `docs/audit/` — read the relevant findings before touching that area.

## 📜 License

By contributing you agree your contributions are released under the MIT License (`LICENSE`).
