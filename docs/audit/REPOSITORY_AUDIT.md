# Repository Audit — KINGCODE IDE (Phase 0)

- **Audited commit:** `45f7284` on `claude/kingcode-ide-audit-modernize-a7ddks` (identical to `origin/main` at start; working tree clean).
- **Audit date:** 2026-11-03
- **Method:** full read of every source file (`index.html`, `js/*.js`, `service-worker.js`, `manifest.json`, `tools/*`, CI workflow, docs) plus live Chromium/Playwright probes against `node tools/server.js`. Probe scripts are reproducible from the "Reproduction" columns below.
- **No source code was modified in Phase 0.** Only `docs/` files were written.

## 1. What the product actually is (verified)

A zero-dependency, Arabic-RTL, single-page **browser code editor PWA**: vanilla ES6 globals loaded via `<script>` tags (no modules/bundler), CodeMirror 5 vendored locally, state in `localStorage`, live preview in a sandboxed `srcdoc` iframe, service worker for offline. ~2,600 lines of app JS, 1,090 lines of CSS.

| Capability | Exists? | Evidence |
|---|---|---|
| Multi-file editor, tabs, syntax highlighting (12 languages), search/replace, themes | Yes | `js/editor.js`, `index.html` mode scripts |
| Project explorer (flat list; **no folders**) | Partial | `js/list.js`; names are flat strings, `/` is rewritten to `-` by `U.safeFileName` |
| Import/export (JSON, multi-file, standalone HTML), pre-import backup + restore | Yes (with defects F-01, F-04, F-08) | `js/files.js` |
| Live preview + console bridge | Yes | `js/preview.js` |
| PWA / offline | Yes | probe: SW active, cache `kingcode-cache-kingcode-v1.0.6`, offline reload boots |
| **Real terminal** | **No** | grep for terminal/xterm/pty: no code. The "console" is the preview's `console.*` mirror, not a shell. |
| **Git / GitHub integration** | **No** | no code; README correctly says so |
| **AI assistant / agents / marketplace / cloud sync** | **No** | no code, no network calls (`fetch(` appears only inside preview user code) |
| Folders, project list (multiple projects) | **No** | single project in `kingcode:state:v1` |

## 2. Status of findings from earlier audit documents

The previous audit docs (v1.0.3 era) mixed fixed, stale and wrong claims. Re-verified at `45f7284`:

| Old ID | Claim | Status now | Evidence |
|---|---|---|---|
| CB-01 toolbar handlers fire twice | **Resolved** | one click → `UI.toggleUiTheme` invoked 1× (probe2); only 8 inline `onclick` remain, none on a button that is also bound in JS |
| CB-02 server crash on `/%` | **Resolved** | `npm test`: 400 and server still serving |
| CB-03 second duplicate fails | **Resolved** | `FILES.duplicate` uses `_uniqueName` (code) |
| CB-04 traversal | **Resolved** | 403 on `/..%2f..%2fREADME.md` and missing path |
| CB-05 / SC-09 JSON MIME | **Resolved** | `npm test` |
| CB-06 duplicate `.file-name` CSS | **Resolved** | single rule (3 selectors) in `components.css`, 0 in `main.css` |
| CB-07 `editText` missing | **Stale** | no references |
| CB-08 version drift | **Resolved + guarded** | config/SW/package/CHANGELOG all 1.0.6; smoke test guards it |
| SC-04 no CSP | **Resolved, with caveats** | meta CSP present; see S-03/S-06 |
| SC-08 wildcard CORS | **Resolved** | `npm test` |
| "Ctrl+S may conflict" | **Not reproduced** | handler calls `preventDefault`; unverified in installed-app mode |
| "Delete confirmation race" | **Not reproduced** | code review: callback-based, no shared mutable state beyond `_confirmCb` |
| Theme toggle "no-op" in first probe | **Not reproduced** | second probe: dark → light correctly. One early read right after load returned `dark`; treated as probe timing, unverified |

## 3. Confirmed defects (new, runtime-verified unless marked)

Severity scale: Critical = silent data loss/RCE in common flow; High = data loss in plausible flow or serious integrity failure; Medium; Low; Info.

### F-01 — Import/restore of >60 files persists, then silently truncates to 60 on next load — **HIGH** (data loss)
- **Evidence:** import of a 100-file JSON → `STATE.files().length === 100`; after reload → **60** (probe5). `U.sanitizeFiles` has no cap; `STATE.hydrate` does `.slice(0, KC.limits.maxFiles)`; `FILES.create`/`importFiles` enforce the cap, `importProject`/`restoreBackup` do not.
- **Files:** `js/utils.js` (`sanitizeFiles`), `js/state.js` (`hydrate`), `js/files.js` (`_applyImported`).
- **Repro:** Settings → import a JSON object with 100 keys → confirm → reload.
- **Impact:** 40 files lost with no message, and the pre-import backup is the only recovery.
- **Fix:** enforce/communicate the limit in `sanitizeFiles` callers (reject or explicitly truncate with a confirmation message); never truncate silently in `hydrate` (warn + keep).
- **Verify:** regression test importing 61 and 100 files.

### F-02 — Persistence failure is silent and shows a false "Saved" — **HIGH** (data loss)
- **Evidence:** with localStorage full, edits show indicator `✓ حُفظ`, in-memory content changes, stored content stays old; the quota toast appears **once per session** (`_quotaWarned`) (probe4).
- **Files:** `js/utils.js` (`storage.set`), `js/editor.js` (`saveFlash` called unconditionally), `js/state.js` (`persist` ignores return value).
- **Impact:** a user keeps typing into a document that is not being saved.
- **Fix:** `persist()` must surface the failure persistently (status-bar "unsaved/ storage full" state, repeat warning, offer export); `saveFlash` only on success.
- **Verify:** Playwright test that fills storage and asserts indicator + repeated warning.

### F-03 — Debounced persist is never flushed on page exit — **MEDIUM** (data loss)
- **Evidence:** typing then reload/navigate within the 250 ms debounce loses the edit (probe2: `fastReload` and `navAway` kept the old text). No `pagehide`/`visibilitychange`/`beforeunload` flush exists.
- **Files:** `js/state.js` (`persist`), `js/ui.js`.
- **Fix:** flush synchronously on `pagehide` and `visibilitychange:hidden` (sync `localStorage.setItem`).
- **Verify:** same probe must keep the edit.

### F-04 — Imported project validation is incomplete — **MEDIUM**
- **Evidence (probe1):** array input accepted (files named `"0"`,`"1"`); `{"a/b.js","a-b.js"}` → **two files both named `a-b.js`**; non-string `content` silently becomes `''`; 200 entries accepted. Duplicate names break `fileByName`, rename checks, preview file mapping, and the JSON export (object keys collapse → files lost).
- **Files:** `js/utils.js` `sanitizeFiles`; `js/files.js`.
- **Fix:** reject arrays/non-objects, dedupe via unique-suffix, cap count and per-file size, report skipped/renamed entries to the user, forbid reserved names (`.`, `..`, empty).

### F-05 — "Auto-save off" does not hold edits back — **MEDIUM** (misleading control)
- **Evidence (probe7):** autoSave off → edit marks file dirty; switching tab (any `persist()`) writes `UNSAVED…` to storage while the file stays marked dirty. `persist()` serializes `d.files`, which the change handler already mutated.
- **Files:** `js/editor.js` change handler, `js/state.js`.
- **Fix:** either remove the setting or keep a separate saved-snapshot so dirty edits are really uncommitted.

### F-06 — Service-worker activation deletes every other cache on the origin — **MEDIUM**
- **Evidence (code):** `caches.keys().filter(k => k !== CACHE_NAME)` → delete. On GitHub Pages (shared `*.github.io` origin) this destroys caches of unrelated apps. Not runtime-tested cross-app (would need two apps on one origin).
- **Fix:** delete only keys that start with `kingcode-cache-`.

### F-07 — Update flow reloads the page automatically — **MEDIUM**
- **Evidence (code):** `install` → `skipWaiting()` unconditionally; page also posts `SKIP_WAITING` after 4 s; `controllerchange` → `location.reload()`. Combined with F-03 this can drop recent edits; with autosave-off it triggers the beforeunload prompt unexpectedly.
- **Fix:** flush before reload, or show "Reload to update" button and let the user choose.

### F-08 — Standalone HTML export is polluted and single-page — **LOW**
- **Evidence (probe5):** exported file begins with the preview console-bridge `<script>` (before `<!DOCTYPE>`), posts to `window.parent`, and logs "sandbox آمن". Exports only the active/first HTML file.
- **Fix:** `buildDocument({ bridge:false })` for export.

### F-09 — README contradicts behavior for external assets — **MEDIUM** (doc/behavior)
- README: "external assets (e.g. CDN) work". Reality: preview inherits the page CSP (`img-src 'self' data:`, `connect-src 'self'`, no remote `script-src`/`font-src`) so **any CDN image/script/font/fetch is blocked** (probe2: three CSP violations). Needs a product decision (see S-03).

### F-10 — Startup toast noise — **LOW**
`APP.checkForUpdate()` shows "Checking for updates…" on every launch (visible in phone screenshot, overlaps console area).

### F-11 — Accessibility gaps — **LOW** (partly unverified) — **STATUS: Tab trap, unnamed buttons/inputs, tree/option roles fixed in 1.2.0 (E2E-guarded); contrast and screen-reader flow still unmeasured**
- `Tab` inside editor inserts spaces and cannot leave the editor by keyboard (WCAG 2.1.2 risk) — code-confirmed.
- 23 `btn-icon` buttons rely on `title` only (no `aria-label`) — measured (probe3).
- `role=option` rows contain nested buttons; palette `li` lack `role=option`.
- Not measured: contrast, focus-visible, screen-reader flow.

### F-12 — Minor logic issues — **LOW**
- Command palette truncates to 14 results; with >14 files, commands are unreachable without typing (`ui.js collect`).
- `FILES.create` ignores `tabsMax`; `importFiles` imports but does not open tabs; `README` still says SW `v1.0.5`/54 assets (actual `v1.0.6`; precache list has 54 entries — count matches only if the earlier number included `./`).
- `hydrate` does not validate setting types/ranges (e.g. `theme` unknown value) or duplicate ids.
- `Commands.run` is guarded but palette `exec()` calls `it.run()` unguarded.

### F-14 — After import/restore the editor kept showing the old document — **HIGH** (data corruption) — found during Phase 3, fixed in 1.0.9
- **Evidence:** import `{zeta.txt}` → `kc.EDITOR.cm.getValue()` still returned the previous project's text and the status bar showed the old file; verified red on 1.0.8 by the `A-02` E2E test. Cause: `_applyImported` assigned `activeId` before `setActive()`, which exits early for an unchanged id, so `active:change` never fired. The next keystroke would write the stale text into the imported file.
- **Fix:** `STATE.replaceProject` + explicit `active:change`. **Verify:** E2E `A-02`.

### F-13 — Info (phone layout cramping **resolved in 1.4.0**: single-pane phone layout + bottom nav, tablet drawer closed by default, E2E-guarded)
- Responsive layouts: no horizontal overflow at 390/820/1366 px (probe3). Phone layout is functional but cramped (preview+console+editor stacked; toast overlaps). Needs design pass, not a defect.
- Large file: 100 k-line paste took ~300 ms; persisted state then reached 1.4 MB, close to the localStorage ceiling (see F-02).
- Workflows verified OK: launch, edit, save, reload (outside the debounce window), tab switching, import → confirm → backup → restore, export JSON, offline reload, SW cache name.

## 4. Unverified concerns (explicit)
- Installed-app (standalone) behavior, Safari/iOS behavior, Firefox behavior.
- SW update path end-to-end across two real deployments.
- CodeMirror 5.65.16 version and advisory status (vendored minified, no banner; README states the version).
- Multi-tab concurrent editing (shared `localStorage`, last-writer-wins; no `storage` event handling).
