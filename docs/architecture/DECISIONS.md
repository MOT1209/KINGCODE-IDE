# Architecture decision records

Short records of decisions that shape the codebase. Format: context → decision → consequences → when to revisit.

## ADR-1 — Keep vanilla JS, no UI framework, no bundler
- **Context.** The app is ~3.2k lines of app JS in global scripts. The audit found no defect that a framework would fix; the defects were missing invariants, storage limits, and missing tests.
- **Decision.** Keep vanilla ES2022 scripts and a zero-runtime-dependency policy. Fix problems at the seams (`STATE` write path, `STORE`, `PreviewBuilder`).
- **Consequences.** Trivial deployment and offline caching; CSP is simple. Cross-file coupling is via globals, guarded by ESLint `no-undef` and E2E tests.
- **Revisit** when a shell (Capacitor/Tauri) or a feature (extensions, LSP) needs code splitting or npm packages at runtime.

## ADR-2 — IndexedDB storage behind `STORE`, localStorage fallback (v1.1.0)
- **Context.** One `localStorage` blob capped projects near 5 MB, was rewritten whole on every change, and failed silently (F-01/F-02, A-01).
- **Decision.** One IndexedDB record per file plus a `meta` record; differential writes; serialized async writes; automatic localStorage fallback; a small synchronous crash journal for `pagehide`; migration from the legacy blob (legacy key left in place).
- **Consequences.** Capacity is orders of magnitude larger; editing one file writes one record (E2E-verified). Cost: boot and flush are async; `pagehide` is best-effort via the journal (the fast-reload E2E test guards it).
- **Revisit** for multi-tab concurrency (currently last-writer-wins) and for cloud sync.

## ADR-3 — Preview runs in `sandbox.html` with its own CSP (v1.0.8)
- **Context.** A `srcdoc` iframe inherits the shell's CSP, which forced `script-src 'unsafe-inline'` on the whole app.
- **Decision.** The iframe loads `sandbox.html` (opaque origin, `allow-scripts allow-modals`, CSP `default-src 'none'`, inline script/style only) and receives the document via a nonce-checked `postMessage`. The shell CSP no longer allows inline scripts.
- **Consequences.** Previews have no network by design (documented in README). Verified in Chromium only.
- **Revisit** if previews need controlled network access (would require a per-project opt-in and a new policy) and after testing in Firefox/Safari.

## ADR-4 — Defer the migration to ES modules (decision: **not now**)
- **Context.** The brief asks for modular structure and the audit proposed native ES modules (`<script type="module">`, still no bundler) to remove global coupling and enable Node-native unit tests.
- **Evaluation.** What modules would buy is already covered another way:
  - *CSP:* inline handlers are gone (v1.0.8); the shell has no `'unsafe-inline'` script.
  - *Testability:* `tools/unit/env.js` loads the DOM-free files in a `vm` context; 43 unit tests run in Node.
  - *Safety net:* ESLint with declared globals catches cross-file typos; 47 E2E tests cover behaviour.
  - *Cost/risk:* converting 14 interdependent files (cycles such as `UI`↔`FILES`↔`PALETTE`, load-order-dependent initialisation, a service-worker precache that must change in lockstep, `window.kc` used by tests) is a large mechanical rewrite whose benefit today is mostly aesthetic; module scripts are also deferred by default, which changes boot timing that several tests rely on.
- **Decision.** Do not migrate in this effort. Keep the extracted pure modules (`STORE`, `PreviewBuilder`, state write path) free of DOM access so they can be converted first.
- **Revisit when** (a) a packaging shell requires a bundler anyway, (b) code splitting or lazy-loaded extensions are needed, or (c) two or more contributors start colliding on globals. Then convert leaf modules first (`utils`, `storage`, `preview-builder`) behind the existing test suites.

## ADR-5 — Keep CodeMirror 5 for now
- **Decision.** CM5 (vendored, 5.65.x as stated in the README; **version not independently verified**, minified files have no banner) stays: it works in every WebView and has no build step. CM5 is in maintenance mode; migrate to CodeMirror 6 as its own test-guarded project before adding LSP-style features, not as part of packaging.

## ADR-6 — Dev-only dependencies (never shipped, never loaded by the app)

The application has **zero runtime dependencies**. These four packages are `devDependencies` used by tests and lint only.

| Package | Purpose | Benefits | Maintenance status* | Security implications | Alternatives considered |
|---|---|---|---|---|---|
| `playwright` | Real-browser E2E tests (`tools/e2e.js`) and benchmarks (`tools/perf.js`) | Only honest way to test persistence, preview isolation, PWA update and responsive layouts; found several real defects | Actively developed by Microsoft | Dev-only; downloads browser binaries in CI; never reaches the app bundle | Puppeteer (Chromium only), Cypress (heavier, in-page runner), WebdriverIO |
| `eslint` | Static analysis (`npm run lint`, CI job) | Catches undefined globals/typos across script files, dead assignments; found a fragile multi-line expression | Actively developed (OpenJS Foundation) | Dev-only; runs on source, no network at run time | Biome, `node --check` + custom scripts (cannot detect undefined names) |
| `@eslint/js` | ESLint's recommended rule set | Maintained with ESLint | Same project as ESLint | Dev-only | Writing the rule list by hand |
| `globals` | Environment global-name lists (browser/node/serviceworker) | Avoids hand-maintained lists | Widely used, maintained by one primary maintainer (bus-factor risk, low impact) | Dev-only | Inline lists in `eslint.config.js` |

\*Maintenance statements are my assessment, not verified against the registries from this environment. No lockfile is committed (the repository had none); CI runs `npm install`. Pin exact versions and commit a lockfile if reproducible installs become a requirement.

## ADR-7 — Single write path for project files
- **Decision.** Every create/rename/move/delete/replace of files and folders goes through `STATE` (`addFile`, `renameFile`, `removeFile`, `addFolder`, `renameFolder`, `removeFolder`, `replaceProject`). `FILES` is the UI layer only. Names are virtual `/`-separated paths sanitized per segment (`U.safePath`), so a path cannot escape the project; file/folder clashes are rejected for user actions and auto-resolved for imports/legacy data.
- **Why.** The cap was enforced in some mutators and not others (F-01), duplicates slipped in (F-04), and one importer left the editor on the old document (F-14).
