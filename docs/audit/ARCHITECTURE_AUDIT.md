# ARCHITECTURE AUDIT — KINGCODE IDE

## Architecture Overview
KINGCODE IDE employs a vanilla ES6 single-page application architecture with a custom pub/sub state management system, CodeMirror 5 embedded locally, and a Service Worker for offline capability. The application follows an MVC-inspired pattern where `state.js` acts as the model, `app.js` orchestrates boot, and UI modules (`ui.js`, `ui.js`) render based on state changes.

## Architectural Patterns

### 1. Custom Pub/Sub Event Bus (`state.js`)
**Pattern:** Flat state object with `_subs` Map for event subscriptions
**Strengths:**
- Lightweight — no external dependency
- Decoupled components via event broadcasting
- Supports wildcard `'*'` events for global handlers
- `on()` returns unsubscribe function for cleanup

**Weaknesses:**
- No async event support — handlers execute synchronously
- No priority ordering for critical events
- No built-in debounce/throttle for high-frequency events
- `_subs` Map grows unbounded — no cleanup on component unmount
- `persist()` debounce can fire twice if `persist()` called rapidly

**Evidence:** 
```javascript
// state.js:34-47
_subs: new Map,

on(event, fn) {
  if (!this._subs.has(event)) this._subs.set(event, new Set());
  this._subs.get(event).add(fn);
  return () => this._subs.get(event)?.delete(fn);
},

emit(event, payload) {
  const subs = this._subs.get(event);
  if (subs) subs.forEach(fn => {
    try { fn(payload); } catch (e) { console.error('[kingCode] handler '+event, e); }
  });
  const all = this._subs.get('*');
  if (all) all.forEach(fn => {
    try { fn({ event, payload }); } catch (e) { console.error('[kingCode] wildcard', e); }
  });
}
```

**Architectural Rating:** Fair — functional for scope but lacks enterprise-grade features.

### 2. Flat Data Model (`state.js`)
**Pattern:** Single `data` object containing `files`, `tabs`, `activeId`, `settings`, `uiPrefs`
**Strengths:**
- Predictable state shape — easy to serialize/deserialize
- Single source of truth for all application state
- `hydrate()` / `persist()` round-trip is deterministic
- Versioned storage via `KC.storageKey`

**Weaknesses:**
- No immutable update patterns — direct mutation possible
- No state selectors — components must read entire state
- No state middleware for logging, crash recovery, etc.
- `setActive()` + `persist()` combo creates tight coupling
- No undo/redo stack beyond autosave dirty tracking

**Evidence:** 
```javascript
// state.js:10-31
data: {
  files: [],           // [{id, name, content, updatedAt}]
  tabs: [],            // [id] بترتيب الفتح
  activeId: null,
  dirty: new Set(),    // files with unsaved buffer (autoSave = off)
  settings: { ... },
  uiPrefs: { previewWidth: 0, sidebarOpen: true }
}
```

**Architectural Rating:** Good for scope; would benefit from Redux/Mediator pattern if scaling.

### 3. CodeMirror 5 Wrapper (`editor.js`)
**Pattern:** Single CodeMirror instance with `docRec()` caching per file ID
**Strengths:**
- Encapsulates CodeMirror initialization and configuration
- `docRec()` preserves doc state (scroll, mode) per file
- `swapDoc()` enables seamless tab switching without reinitialization
- Event handlers (`change`, `cursorActivity`) synchronize state

**Weaknesses:**
- **Double docs Map leak** — `EDITOR.docRec()` creates new `CodeMirror.Doc` but `docModeChanged()` only deletes from Map on rename; files opened after rename accumulate in Map
- Only one editor instance — cannot have multiple simultaneous editors
- `this._suspendEvents` flag pattern is fragile — if exception occurs between set/reset, events remain suspended
- No support for language switching without full doc recreation
- CodeMirror 5 is unmaintained (last release 2023)

**Evidence:** 
```javascript
// editor.js:100-110
docRec(id) {
  const f = STATE.file(id);
  if (!f) return null;
  let rec = this.docs.get(id);
  if (!rec) {
    const doc = CodeMirror.Doc(f.content || '', this.modeFor(f));
    rec = { doc, scroll: null };
    this.docs.set(id, rec);  // ← Leaked on rename unless docModeChanged deletes
  }
  return rec;
},

// editor.js:133-138
docModeChanged(id) {
  if (!this.docs.has(id)) return;
  const wasActive = STATE.data.activeId === id;
  this.docs.delete(id);      // ← Only called on file rename
  if (wasActive) this.open(id);
},
```

**Architectural Rating:** Fair — CodeMirror 5 limitation is the primary constraint; migration to CM6 recommended.

### 4. LocalStorage-Persisted Virtual File System
**Pattern:** `localStorage` JSON serialization with versioned key `kingcode:state:v1`
**Strengths:**
- Zero external dependencies — works in all browsers
- Versioned storage enables future migration
- `U.storage.usage()` provides quota awareness
- `KC.limits` enforces maxFiles (60) and consoleMax (200)

**Weaknesses:**
- **Quota-limited** — typical browsers limit to 5-10MB total per origin
- No IndexedDB fallback beyond basic size calculation
- Serialization of large file contents may exceed storage limits
- No conflict resolution for concurrent tab editing
- `localStorage` shared across all same-origin tabs — race conditions possible

**Evidence:** 
```javascript
// utils.js:40-72
storage: {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      console.warn('[kingCode] storage read failed:', e);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[kingCode] storage write failed:', e);
      return false;
    }
  },
  usage() {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        total += (k.length + (localStorage.getItem(k) || '').length) * 2;
      }
      return total;
    } catch (e) { return 0; }
  }
}
```

**Architectural Rating:** Fair — functional for scope; IndexedDB integration recommended for production.

### 5. iframe-Sandboxed Preview System (`preview.js`)
**Pattern:** `srcdoc` iframe with `sandbox="allow-scripts allow-forms allow-modals allow-popups"` + console bridge via `postMessage`
**Strengths:**
- Isolation of user project code from IDE main thread
- Automatic CSS/JS injection from project files
- Console message forwarding to IDE UI
- `srcdoc` avoids external URL risks

**Weaknesses:**
- **Sandbox too permissive** — `allow-modals` and `allow-popups` enable modal/popup attacks
- **No CSP** within iframe — `srcdoc` inherits parent's policies loosely
- **postMessage `*` targetOrigin** — SC-06 vulnerability
- **`inject()` regex-based HTML processing** — fragile; may miss edge cases
- **No diffing** — rebuilds entire document on each schedule tick
- **Memory leak risk** — `srcdoc` content replaces entirely; old DOM garbage-collected

**Evidence:** 
```javascript
// preview.js:111-112
<iframe id="preview-frame" sandbox="allow-scripts allow-forms allow-modals allow-popups"
        allowtransparency="true" title="معاينة المشروع"></iframe>

// preview.js:155-191
injectConsoleBridge(content) {
  const bridge = `<script>
  ['log','info','warn','error','debug'].forEach(function(level) {
    var old = console[level];
    console[level] = function() {
      try { window.parent.postMessage({ __kingcode: true, type: 'console', level: level, parts: fmt(arguments) }, '*'); } catch (e) {}
      try { old.apply(console, arguments); } catch (e) {}
    };
  });
  // ... window.onerror + unhandledrejection ...
  </script>`;
  return bridge + content;
}
```

**Architectural Rating:** Fair — security limitations require refinements; CM6 + modern sandbox patterns recommended.

### 6. Static File Server (`tools/server.js`)
**Pattern:** Simple Node http server with file routing and SPA fallback
**Strengths:**
- Zero dependencies — `node http + fs + path`
- Serves CodeMirror assets locally (no CDN dependency)
- Manifest gets the web-app manifest MIME — but via the shared `.json` map entry, so other `.json` files get it too (bug, CB-05)
- CLI-friendly: `node tools/server.js` → `http://localhost:8123`

**Weaknesses:**
- **`decodeURIComponent` uncaught** — line 42 throws `URIError` on `/%`-class URLs and **kills the whole process**, confirmed live twice (`Exited with code 1`)
- **Path boundary is accidental, not enforced** — `path.normalize()` silently drops leading `..` after the root anchor, remapping traversal attempts inside ROOT (`/..%2f..%2fREADME.md` → 200 with in-root README; missing target → 404 not 403); the `startsWith(ROOT)` check without trailing separator would also admit sibling dirs named `ROOT-*`
- **Wildcard CORS** — `Access-Control-Allow-Origin: '*'` on every response lets any website read project files while the server runs
- **MIME mis-map** — every `.json` served as `application/manifest+json`
- **No ETag/Cache-Control differentiation** — all responses `no-store`
- **No gzip/compression** — larger asset transfers
- **Single-threaded** — blocking I/O during `fs.readFile`
- **No HTTPS enforcement** — served over HTTP only

**Evidence:** 
```javascript
// server.js:42
let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
// No try/catch — uncaught exception crashes the server

// server.js:46-50
const filePath = path.join(ROOT, path.normalize(urlPath));
if (!filePath.startsWith(ROOT)) {
  send(res, 403, 'Forbidden', 'text/plain');
  return;
}
```

**Architectural Rating:** Poor — should be replaced with production-grade static server (Vite, esbuild, or established library).

### 7. URL Router (`app.js`)
**Pattern:** Minimal URL action processing via `?action=` query parameter
**Strengths:**
- Simple — `?action=new-file` or `?action=preview`
- No external routing library dependency
- Explicit, readable code

**Weaknesses:**
- **No route guarding** — any URL parameter processed without validation
- **No 404 handling** for non-`index.html` paths (SPA fallback only on server)
- **No deep-link state preservation** — query params not stored in state
- **`processUrlAction()` modifies `history`** but without state sync

**Evidence:** 
```javascript
// app.js:110-116
processUrlAction() {
  const q = new URLSearchParams(location.search);
  const act = q.get('action');
  if (act === 'new-file') setTimeout(() => FILES.newFile(), 250);
  else if (act === 'preview') STATE.setSetting('showPreview', true);
  history.replaceState({}, '', location.pathname);  // ← Drops query params
}
```

**Architectural Rating:** Fair — sufficient for v1; could be enhanced with proper router.

---

## Module Dependencies Map

```
index.html
├─ ↳ css/main.css
├─ ↳ css/components.css
├─ ↳ link[manifest] manifest.json
├─ ↳ link[icon] icons/
├─ ↳ CodeMirror CSS themes (9 themes)
├─ ↳ CodeMirror core + modes + addons (33 vendor files)
├─ ↳ js/config.js           ← KC.API, TEMPLATES, LANGS, THEMES
├─ ↳ js/utils.js            ← DOM, storage, debounce, escapeHtml
├─ ↳ js/state.js            ← Event bus, persist, hydrate, data model
├─ ↳ js/editor.js           ← CodeMirror wrapper
├─ ↳ js/files.js            ← CRUD, import/export
├─ ↳ js/list.js             ← File list UI rendering
├─ ↳ js/tabs.js             ← Tab bar UI
├─ ↳ js/preview.js          ← iframe + console bridge
├─ ↳ js/ui.js               ← Modals, toasts, shortcuts, responsive
└─ ↳ js/app.js              ← Boot order, SW register, URL actions
```

```
js/state.js ← emits ← js/ui.js, js/editor.js, js/files.js, js/preview.js, js/tabs.js
js/editor.js ← reads ← js/state.js (settings), KC from js/config.js
js/files.js ← reads ← js/state.js (files, settings), KC from js/config.js, utils from js/utils.js
js/preview.js ← reads ← js/state.js (files, settings, autoPreview), js/ui.js (consoleAppend)
js/ui.js ← reads/writes ← js/state.js (settings, uiPrefs), KC from js/config.js
js/app.js ← boot sequence: STATE.hydrate → FILE_LIST.init → TABS.init → PALETTE.init → UI.init → EDITOR.init → PREVIEW.init
```

---

## Identified Architectural Issues

### AI-01: Double Event Binding — Inline `onclick` + `addEventListener` (Runtime-Confirmed)
**Location:** `index.html` (inline `onclick` attrs) + `js/ui.js:186-194` (`addEventListener` bindings)
**Description:** toolbar buttons are wired twice — once via the `onclick` attribute and once via `addEventListener` — so a single click invokes the handler **twice**. Measured live: one click on `#btnThemeToggle` → `UI.toggleUiTheme` invoked 2 times, theme ends where it started. Affects: `btnThemeToggle`, `btnSplitPreview`, `btnConsoleToggle`, `btnPalette`, `btnSettings`, `btnNewFile`, `btnImportFile`, `btnExport` (double download), `btnImport`. Toggle-type buttons become visual no-ops.
Separately, the historical `pref:sidebarOpen` recursion (`RangeError: Maximum call stack size exceeded`, seen in old `.playwright-mcp` logs) did **not reproduce at HEAD** — `UI.toggleSidebar()` runs clean; treated as historically fixed.
**Impact:** All toolbar toggles dead (theme/preview/console/palette); export button downloads the file twice; user-state confusion.
**Fix:** Remove either the inline `onclick` attributes or the duplicate `addEventListener` calls — one wiring channel per button.

### AI-02: CodeMirror 5 Unmaintained
**Location:** `vendor/codemirror/` (33 files)  
**Description:** CodeMirror 5.65.16 last released ~2021; no official security fixes after 2023. Missing modern editor features (textarea-based input, modern cursor animation, built-in language servers).  
**Impact:** Security vulnerabilities unpatched; poor mobile support; limited language mode support; increasing compatibility issues with modern browsers.  
**Fix:** Plan migration to CodeMirror 6 or Monaco Editor.

### AI-03: Single Editor Instance
**Location:** `js/editor.js`  
**Description:** Only one CodeMirror instance exists; tab switching uses `swapDoc()` to swap docs, but cannot have multiple files edited simultaneously in separate CodeMirror instances.  
**Impact:** Limited to one file at a time per IDE session; workflow disruption for multi-file projects.  
**Fix:** Either support multiple CodeMirror instances or enhance `swapDoc` workflow.

### AI-04: localStorage Quota No Crash Handling
**Location:** `js/utils.js:62-71`, `js/state.js:88-106`  
**Description:** `U.storage.usage()` returns 0 on error (swallowing); no try/catch around operations that may exceed quota; `localStorage.setItem` throws QUOTA_EXCEEDED_ERR silently in some code paths.  
**Impact:** Silent data loss when user exceeds browser storage limits; no user feedback.  
**Fix:** Add quota error handling with user-visible warnings; consider IndexedDB migration.

### AI-05: Fragile `inject()` HTML Regex Processing
**Location:** `js/preview.js:112-152`  
**Description:** `buildDocument()` → `inject()` uses `.replace()` with regex to process HTML. Regex patterns may not handle all HTML edge cases; nested tags, malformed HTML, or unusual attributes may cause incorrect output or XSS.  
**Impact:** Unpredictable preview output; potential XSS vectors.  
**Fix:** Use DOMParser API for HTML parsing; sanitize before injection.

### AI-06: Server Single Point of Failure
**Location:** `tools/server.js`  
**Description:** Custom Node http server with no error recovery beyond `EADDRINUSE`; `decodeURIComponent` uncaught exception crashes entire server (**runtime-confirmed twice on 2026-11-02: `URIError: URI malformed @ tools/server.js:42:17`, `Exited with code 1`, one `%` request each time**); no keep-alive or connection pooling.  
**Impact:** Developer cannot locally test the IDE if the server crashes; any stray malformed request (logs, bots, curl history) kills the dev loop.  
**Fix:** try/catch → 400 response at minimum; ideally replace with Vite dev server or serve static files from existing hosting.

### AI-07: No Module System / Dependency Management
**Location:** Entire project  
**Description:** All scripts loaded synchronously in `<script>` tags; no module bundler, no `type="module"`, no dependency ordering guarantees beyond manual script order in `index.html`.  
**Impact:** Hard to maintain; difficult to add/remove features; no tree-shaking; bundle size unknown.  
**Fix:** Migrate to modern build toolchain (Vite, esbuild, webpack).

### AI-08: Global Scope Pollution
**Location:** `js/app.js:59-65`  
**Description:** `window.files = FILES`, `window.ui = UI`, `window.preview = PREVIEW`, `window.tabs = TABS`, `window.editor = EDITOR`, `window.state = STATE`, `window.kc = { KC, STATE, ... }` — 9 globals exposed.  
**Impact:** Testing difficulties; naming collisions; accidental modification; hard to encapsulate.  
**Fix:** Use module pattern, expose only necessary APIs; consider micro-frontend architecture.

### AI-09: No Error Boundary / Crash Recovery
**Location:** Throughout  
**Description:** Top-level `try/catch` in `app.js:120-128` only; no error boundaries around critical operations (CodeMirror init, SW register, localStorage).  
**Impact:** Unhandled errors propagate to top level; IDE may leave partially-initialized state.  
**Fix:** Add error boundaries; implement graceful degradation; add recovery flows.

### AI-10: Tight Bootstrapping Coupling
**Location:** `js/app.js:10-32`  
**Description:** Boot order is sequential and imperative: hydrate → init modules → render. Each module depends on state being ready; no async initialization; `boot()` throws if any module fails.  
**Impact:** Single point of failure stops entire IDE initialization; poor resilience.  
**Fix:** Make initialization resilient; allow partial functionality; add fallback defaults.

---

## Recommendations Summary

| Area | Recommendation | Effort | Impact |
|------|---------------|--------|--------|
| **Editor** | Migrate CodeMirror 5 → CodeMirror 6 | Medium-High | High (security, mobile, features) |
| **Server** | Replace custom server with Vite | Medium | High (stability, features) |
| **Build** | Migrate to Vite + ES modules | Medium-High | High (maintainability) |
| **State** | Keep custom pub/sub or migrate to Mediator | Low-Medium | Medium |
| **Storage** | Add IndexedDB via localforage | Medium | High (quota, persistence) |
| **Preview** | Refine sandbox + CSP + DOMParser | Medium | High (security) |
| **Globals** | Reduce `window.*` exposure | Low | Medium (testability) |
| **Error Handling** | Add error boundaries | Low-Medium | Medium (resilience) |
| **CSS** | Consolidate duplicate `.file-name` rules | Low | Low (visual) |
| **Testing** | Add Vitest + Playwright suite | Medium-High | High (quality) |

**Overall Architecture Rating:** Fair — functional for v1 scope but requires modernization for production readiness. Primary risks: CodeMirror 5 unmaintained, server vulnerabilities, localStorage limitations.

---

## Migration Path

### Phase 1: Immediate (Weeks 1-2)
- Fix critical bugs (sidebar recursion, server crashes)
- Consolidate CSS rules
- Add basic error handling

### Phase 2: Build System (Weeks 3-6)
- Introduce Vite as dev server + module bundler
- Migrate to ES modules (`type="module"`)
- Code splitting for CodeMirror modes

### Phase 3: Editor Modernization (Weeks 7-12)
- Migrate CodeMirror 5 → CodeMirror 6
- Or evaluate Monaco Editor
- Implement intelligent autocomplete behind abstraction

### Phase 4: Storage & State (Weeks 13-18)
- Integrate IndexedDB via localforage
- Add quota handling + warnings
- Refine pub/sub with error boundaries

### Phase 5: Preview & Security (Weeks 19-24)
- Refine iframe sandbox
- Add CSP
- HTML sanitization in preview
- postMessage origin restriction

### Phase 6: Production Hardening (Weeks 25-30)
- Error boundaries throughout
- Comprehensive test suite
- Performance optimization
- Deployment configuration

**Estimated total migration time:** 20-26 weeks for production-ready architecture.