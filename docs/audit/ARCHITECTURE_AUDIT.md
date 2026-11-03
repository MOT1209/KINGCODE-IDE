# Architecture Audit — KINGCODE IDE (Phase 0)

Audited commit `45f7284`, 2026-11-03.

## 1. Current structure (verified)

```
index.html ── loads CodeMirror (vendor) then js/ in fixed order:
config → utils → state → editor → files → list → tabs → preview → ui → app
```
- **Module system:** none. Each file declares a global `const` (`KC, U, STATE, EDITOR, FILES, FILE_LIST, TABS, PREVIEW, UI, PALETTE, Commands, APP`). Load order is the dependency graph. A `window.kc` debug handle and `window.files/ui/preview/tabs/editor/state` globals exist for inline `onclick` and tests.
- **State:** single mutable object `STATE.data` + string-keyed pub/sub (`on/emit`, plus a `*` wildcard). Mutations happen from many modules directly (`STATE.data.files.push`, `STATE.data.tabs = …`) instead of through actions.
- **Persistence:** whole-state JSON blob to one `localStorage` key, debounced 250 ms, synchronous API that all callers assume.
- **Rendering:** imperative DOM; `FILE_LIST`/`TABS` re-render fully on every change event (fine at ≤60 files).
- **Editor:** one CodeMirror instance; one `CodeMirror.Doc` per file swapped with `swapDoc`; docs cached in `EDITOR.docs` (leak on delete already fixed).

## 2. Strengths worth preserving
- Zero dependencies, trivial deployment, fully offline.
- Clean single-editor/multi-Doc design (undo history per file preserved).
- Command registry (`Commands`) already decouples palette/shortcuts/menus from implementations — good seam for plugins.
- Event bus already decouples renderers from state changes.
- Small modules, low coupling by file; sanitization at DOM sinks is consistent.
- Existing regression discipline (CHANGELOG, version-triple guard).

## 3. Architectural findings

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| A-01 | **No storage abstraction.** Storage is `localStorage` (≈5 MB, sync). Whole project re-serialized on every change; 100 k lines → 1.4 MB per keystroke-debounce; hard ceiling causes F-02. IndexedDB migration is blocked because consumers are synchronous (comment in `utils.js` acknowledges). | High (structural) | `state.js persist/hydrate`, probe2 |
| A-02 | **State mutated from everywhere; no single write path.** Source of F-01 (cap enforced in some mutators, not others), F-04, F-05. | Medium | `files.js` `_applyImported`, `importFiles`, `create` all push to `STATE.data.files` independently |
| A-03 | **No file/FS abstraction.** Flat name→content with no folders/paths; tied to `STATE.data.files`. Blocks real project trees, Git, native FS (Android/Windows). | High (for roadmap) | `U.safeFileName` strips `/` |
| A-04 | **Global-script architecture, no ES modules.** Order-dependent, untestable in Node without a browser, no tree-shaking, inline `onclick` forces `window.*` aliases and `'unsafe-inline'` CSP. | Medium | `index.html`, `app.js` step 8 |
| A-05 | **Preview pipeline is string/regex based** (`inject` regex over HTML for `<link>`/`<script src>`), single-HTML-page only, no module scripts/`import`, no asset (image) resolution from project files, bridge and export share one code path. | Medium | `preview.js` |
| A-06 | **Mixed responsibilities in `ui.js` (654 lines):** command registry, palette, modals, toasts, console, settings, responsive, PWA install, splitter. | Low | `ui.js` |
| A-07 | **Config/version duplication:** version in `config.js`, `service-worker.js`, `package.json`, CHANGELOG (guarded by test, but manual). Precache list manual and can drift from `index.html`. | Low | `service-worker.js ASSETS` |
| A-08 | **Service worker strategy:** cache-first + background revalidate for JS means a deploy can serve mixed old/new module files for one load; mitigated by version bump + `skipWaiting`, which causes F-07. | Medium | `service-worker.js` |
| A-09 | **No extension surface** beyond `Commands.add`; no manifest/permission model; no language-server/formatter hooks. | Info | — |
| A-10 | **Documentation drift:** README SW version and CDN claim wrong; two stale roadmap docs (`DEVELOPMENT_ROADMAP.md`, `FEATURE_MATRIX.md`) predate current code. | Low | Phase 0 |

## 4. Recommendations (sequenced, minimal-rewrite)

1. **Introduce one write path** (`STATE` actions: `addFiles`, `replaceProject`, `renameFile`, `removeFile`) that owns invariants: unique names, caps, size limits, tab consistency. All importers/creators call it. Fixes F-01/F-04 structurally. *No framework needed.*
2. **Introduce a `Storage` adapter** with async interface (`load()`, `saveProject()`, `saveBlob()`), first implementation = current `localStorage`, second = IndexedDB. Make `boot()` async once. Keep the blob key for migration. Fixes F-02 headroom.
3. **Add a virtual filesystem layer** (`VFS`: paths with `/`, folders as prefixes) behind the same adapter; migrate flat names (they are valid root paths). Prerequisite for Git, native FS, and projects with folders.
4. **Convert to ES modules incrementally** (keep no-build deployment: native `<script type="module">`). Remove inline handlers → tighten CSP. Allows Node unit tests of `state/files/utils`.
5. **Preview builder as a pure function** (`buildPreviewDocument(project, entry, {bridge})`) with its own tests; later swap regex for a DOM-parser (`DOMParser`) pass.
6. **Split `ui.js`** (commands, palette, dialogs, toast, console, responsive, pwa).
7. Do **not** adopt a UI framework or bundler now: no finding requires one; revisit only for the Android/Windows packaging phase (see Phase 8 doc).

## 5. Dependency policy
No dependency is proposed for Phases 1–3. Candidates only if needed later (each requires the Purpose/Benefits/Maintenance/Security/Alternatives write-up): `playwright` (devDependency, E2E — justified in TESTING_AUDIT), `eslint` (devDependency, lint).
