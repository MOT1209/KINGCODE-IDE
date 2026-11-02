# REPOSITORY AUDIT — KINGCODE IDE

## Executive Summary
KINGCODE IDE is a vanilla ES6 PWA code editor (Arabic RTL UI) with CodeMirror 5.65.16 embedded locally. It functions offline-capable with localStorage persistence, CodeMirror-based editor, iframe sandboxed preview, and basic file management. The project is at v1.0.3 with 3 git commits and no external dependencies.

---

## ⚠️ Working-Tree Drift (discovered 2026-11-02, post-audit)

The static audit was performed against the committed `HEAD`. **During audit finalization, `git status` revealed uncommitted source modifications in 7 files** (`index.html`, `js/app.js`, `js/files.js`, `js/preview.js`, `js/ui.js`, `js/utils.js`, `service-worker.js`) plus new untracked files (`docs/`, `plan.md`). These changes were **NOT produced by this audit session**. They apply repairs that map almost one-to-one onto this audit's findings:

| Working-tree change (uncommitted) | Audit finding it addresses | Status of that finding now |
|---|---|---|
| CSP `<meta http-equiv="Content-Security-Policy">` in `index.html` | SC-04 (no CSP) | **Fixed in working tree** (verified present; note: policy includes `frame-src 'none'` and coexists with the preview — empirically the preview bridge still executed, see below) |
| Preview sandbox `allow-forms allow-popups` removed → `allow-scripts allow-modals` | SC-02/SC-04 (permissive sandbox) | **Fixed in working tree** |
| `js/files.js`: `EDITOR.docs.delete(id)` on file remove | PE-04 / roadmap 1.5 (docs Map leak) | **Fixed in working tree** |
| `js/preview.js`: message-source validation (`e.source !== this.frame.contentWindow → return`) + `U.escapeHtml` on injected style/script `data-kc-src` names | SC-02/SC-06 partial | **Partially fixed in working tree** (bridge `postMessage` still uses `'*'` targetOrigin) |
| `js/utils.js`: one-time quota-exceeded toast; comment warns future IndexedDB merge requires async consumers | PE-02 / AI-04 | **Partially fixed in working tree** (storage still localStorage-only, by documented decision) |
| `service-worker.js`: `VERSION` → `kingcode-v1.0.3` | Roadmap 1.8 (version drift) | **Partially fixed** — SW now matches commit v1.0.3, but `js/config.js` version (`1.0.0`) remains out of sync |
| `js/ui.js`: RTL-aware `Alt+←/→` tab cycling | UI improvement (not previously flagged) | New behavior |

Still **NOT addressed** in the working tree (re-verified live against it): CB-01 toolbar double-binding (`invocations: 2` measured after these changes), CB-02 server crash (`tools/server.js` untouched, crash reproduced ×2), CB-03 duplicate-2nd-fails, SC-08 wildcard CORS, SC-09 `.json` MIME mis-map, `postMessage('*')` in the bridge, `js/config.js` version stamp.

Live evidence gathered after the drift: with the new CSP + sandbox, the preview iframe **executed its scripts and delivered console messages** (`[kingCode] المعاينة جاهزة…`, template `console.log` at 15:32:47-48) — `frame-src 'none'` did not block the `srcdoc` frame in practice, and consecutive `PREVIEW.refresh()` calls with an unchanged `srcdoc` produce no new frame load (no `load` event re-fired).

**Note:** `plan.md` (untracked, repo root) predates this audit session and is not part of the audit deliverables.

Attribution is unknown from within this session; treat them as user work until the user states otherwise. **No commit, revert, or staging has been performed.**

---

## Current Architecture

### Technology Stack
| Layer | Technology |
|------|-----------|
| UI | Vanilla HTML5/CSS3/ES6 (RTL Arabic) |
| Editor | CodeMirror 5.65.16 (local vendor, 33 files) |
| State | Custom pub/sub system in `state.js` |
| Storage | `localStorage` with JSON serialization |
| PWA | Service Worker v1.0.2 (Cache-First assets, Network-First documents) |
| Build | Static file server `tools/server.js` (Node http) |
| Navigation | URL `?action=new-file` / `?action=preview` shortcuts |
| Debug | `window.kc` global exposure for testing |

### Directory Structure
```
kingcode/
├─ index.html              # Main doc (RTL, 4 modals, ARIA)
├─ manifest.json           # PWA manifest (id=./, dir=rtl, lang=ar)
├─ service-worker.js       # SW v1.0.2 (Cache + Network strategy)
├─ css/                    # main.css + components.css (tokens + UI)
├─ js/
│  ├─ config.js            # Templates, LANGS map, TEMPLATES, KC API
│  ├─ utils.js             # DOM helpers, debounce, storage, escapeHtml
│  ├─ state.js             # Central state + event bus + persist
│  ├─ editor.js            # CodeMirror wrapper (single editor)
│  ├─ files.js             # CRUD, import/export, templates
│  ├─ list.js              # File list UI rendering + click handlers
│  ├─ tabs.js              # Tab bar + close/cycle/rename
│  ├─ preview.js           # iframe srcdoc build + console bridge
│  ├─ ui.js                # Modals, toasts, shortcuts, responsive
│  └─ app.js               # Boot order, SW register, URL actions
├─ vendor/codemirror/      # CodeMirror v5.65.16 (33 files)
├─ icons/                  # PWA icons (SVG + PNG maskable)
└─ tools/server.js         # Static HTTP server (PORT 8123)
```

### Key Systems
1. **State Management** — Flat data model with `_subs` event bus in `state.js`
2. **CodeMirror Integration** — Single editor instance, `docRec()` per file, `swapDoc()` on tab change
3. **Preview System** — iframe with `sandbox="allow-scripts allow-forms allow-modals allow-popups"`, console bridge via `postMessage`
4. **File System** — `localStorage`-based virtual file system, `KC.storageKey` versioned
5. **Service Worker** — Cache-First for assets, Network-First for documents
6. **UI Layer** — Modals, toasts, command palette, responsive breakpoints

---

## Existing Feature Inventory

### ✅ Working Features
- CodeMirror 5.65.16 editor with syntax highlighting for: HTML, CSS, JS, JS Module, JSON, Markdown, Python, SQL, YAML, XML, SVG, TXT
- CodeMirror addons: matchBrackets, closeBrackets, active-line, search, hint (xml/js/css), comment, closeTag, closeBrackets
- File creation with templates (HTML, JS, CSS, JSON, MD, PY, SQL, YAML, XML, SVG, TXT)
- File rename with conflict detection
- File duplication
- File deletion (with confirmation)
- File import (single JSON, multiple text files)
- File export (JSON project, HTML project)
- Autosave toggle (localStorage persisted)
- Theme toggle (dark/light)
- Font size control
- Tab management (open/close/cycle)
- Command palette (Ctrl+P) with file + command search
- Preview iframe with live updates
- Console bridge (console.log/info/warn/error piped to UI)
- Network online/offline indicator
- PWA install (beforeinstallprompt + appinstalled event)
- Status bar (file name + language + cursor position)
- Splitter resizer between editor/preview
- Mobile responsive layout (view-mobile/view-tablet/view-desktop classes)
- Edge-toggle hamburger for mobile
- Mobile quickbar (sidebar nav, prev/next tabs, settings)
- Settings modal with all controls
- Confirmation modals (delete, rename)
- Prompt modals
- Toast notifications
- Service Worker caching (~54 assets)

### ⚠️ Partially Working / Needs Investigation
- **Ctrl+S keyboard shortcut** — registered in CodeMirror but may conflict with browser save; log showed `Ctrl + S` appearing in console messages from preview
- **Auto-preview** — toggles but depends on `schedule()` debounce timing
- **Tab rename UI** — invokes prompt but may have edge cases
- **Delete protection** — prevents deleting last file, but confirmation flow has potential race conditions
- **Service Worker update** — registers but update mechanism may not clear old caches reliably

### ❌ Non-Functional / Broken (runtime-verified 2026-11-02)
- **Toolbar buttons fire twice per click** — one click on `#btnThemeToggle` invokes `UI.toggleUiTheme` **2 times** (monkey-patch counter). Theme stays unchanged (double toggle = no-op). Same wiring (`onclick` attr in `index.html` + `addEventListener` in `js/ui.js:186-194`) affects: `btnSplitPreview`, `btnConsoleToggle`, `btnPalette`, `btnSettings`, `btnNewFile`, `btnImportFile`, `btnExport` (double download), `btnImport`
- **Server dies on any malformed URL (`%`)** — `GET /%` → `URIError: URI malformed` at `tools/server.js:42` → entire Node process exits (reproduced twice on two fresh instances, `Exited with code 1`)
- **`FILES.duplicate()` fails on second use** — duplicating the same file twice: first creates `index copy.html`, second returns `false` silently (`_uniqueName` not used in `create()`)
- **Server traversal handled by accident, not by design** — `GET /..%2f..%2fREADME.md` → **200** (not 403): `path.normalize()` silently drops leading `..` after the root anchor, remapping the path inside ROOT; missing targets return 404 not 403. No outside-root leak observed, but the boundary check never actually fired — must be hardened (see Security SC-01)
- **`pref:sidebarOpen` recursion (historical)** — `RangeError: Maximum call stack size exceeded` seen in old `.playwright-mcp` logs; **NOT reproduced at HEAD** — `UI.toggleSidebar()` runs clean. Marked historically fixed; verify only
- **Duplicate CSS class `.file-name`** — defined in both `css/main.css:146` and `css/components.css:112` with different styles
- **`.json` MIME bug** — `MIME['.json'] = 'application/manifest+json'` serves EVERY json file as a web-app manifest type (live-confirmed header on `/manifest.json`; applies to any `.json` too)
- **Cross-origin read:** every response carries `Access-Control-Allow-Origin: '*'` (`server.js:36`) — any website in the user's browser can read repo files while the dev server runs
- **`editText` function missing** — CLOSED (2026-11-02, false positive): repo-wide search shows **zero references** to `editText` in any code file at HEAD; the only remaining mentions are the audit documents themselves. Nothing to add or remove (YAGNI closure)
- **Storage quota** — no handling for quota exceeded errors; `localStorage` limits not enforced beyond `KC.limits.maxFiles`

---

## Critical Bugs

| # | Description | Severity | File | Evidence |
|---|-----------|----------|------|---------|
| CB-01 | **Toolbar buttons double-bound**: inline `onclick` attr (`index.html`) + `addEventListener` (`js/ui.js:186-194`) → every click fires the handler **twice** | **Critical** | `index.html` + `js/ui.js:186-194` | **Live (Playwright)**: 1 click on `#btnThemeToggle` → `invocations: 2`, theme stays `dark`; same pattern affects 9 buttons; `btnExport` downloads twice |
| CB-02 | **Server fatal crash on malformed URL** — `decodeURIComponent` uncaught; one request kills the whole process | **Critical** | `tools/server.js:42` | **Live ×2**: `GET /%` → `URIError: URI malformed @ tools/server.js:42:17`, `Node.js v24.19.0`, `Exited with code 1` |
| CB-03 | **`FILES.duplicate()` fails on 2nd duplicate** — no `_uniqueName()` in `create()`; name collision returns `false` silently | **Medium** | `js/files.js:113-119` | **Live**: 1st dup → `index copy.html` OK; 2nd dup → `secondOk: false`, no file, no visible error |
| CB-04 | **Traversal URL works only by accident** — `path.normalize` drops leading `..` after root anchor; path remaps inside ROOT instead of being rejected | **Medium** | `tools/server.js:46` | **Live**: `/..%2f..%2fREADME.md` → 200 (repo README served); `/..%2f..%2fmissing.md` → 404 (not 403) |
| CB-05 | **`.json` MIME mis-map**: every `.json` served as `application/manifest+json` | **Low** | `tools/server.js:22` | **Live header**: `Content-Type: application/manifest+json` on `/manifest.json` (map entry applies to all `.json`) |
| CB-06 | Duplicate `.file-name` CSS definitions with conflicting styles | **Medium** | `css/main.css:146`, `css/components.css:112` | Same class defined twice; last definition wins |
| CB-07 | `editText` utility referenced but not defined | **Low** | `js/utils.js` | **مغلق (false-positive) 2026-11-02 — صفر إشارات في أي ملف كود عند HEAD؛ الإشارات الوحيدة الباقية هي وثائق التدقيق ذاتها** |
| CB-08 | `pref:sidebarOpen` recursion — **historical, fixed at HEAD** | Closed (historical) | `js/state.js` | Old `.playwright-mcp` logs showed `RangeError: Maximum call stack size exceeded`; **not reproduced** at HEAD — `UI.toggleSidebar()` ran clean (live) |

---

## حالة المرحلة الأولى (إصلاحات v1.0.4) — 2026-11-02

نُفّذت إصلاحات المرحلة 1 بأوامر حية بعد كل كوميت ذرّي (الدليل الفعلي مذكور):

| البند | الحالة | الكوميت | دليل حي (2026-11-02) |
|------|--------|---------|------------------------|
| CB-01 ربط مزدوج | **مُصلَح** | `d76f74d` (حذف `onclick` المضمن من 8 أزرار؛ بقيت قناة `ui.js:186-194` وحيدة — `btnConsoleToggle` لم يكن مزدوجاً أصلاً) | نقرة = `invocations: 1`، الثيم `dark→light` ثم عودة `light→dark` (كان قبل: `invocations: 2` والثيم ثابت) |
| CB-02 انهيار السيرفر | **مُصلَح** | `558845d` | `GET /foo%bar` → **400 Bad Request** (كان Exit 1)، والطلب التالي **200** — العملية حيّة |
| CB-03 تكرار الملفات | **مُصلَح** | `12087a4` | تكراران متتاليان: `index copy.html` ثم **`index copy-2.html`** (كان الثاني يعيد `false` بصمت)؛ نُظّفت أثر الاختبار عبر مسار المستخدم الحقيقي (remove + مودال التأكيد) |
| CB-04 اختراق الجذر | **مُصلَح** | `558845d` | `/..%2f..%2fREADME.md` → **403** (كان 200!) ونسخة الملف المفقود → **403** (كان 404 — لم يبق أوروراكل تسريب الوجود)؛ أصبحت المقارنة `resolve(ROOT, '.' + path)` مع فاصل الجذر النهائي فترفض الأشقاء (مثل `kingcode-x`) التي كانت تقبلها `startsWith(ROOT)` |
| CB-05 MIME الـ `.json` | **مُصلَح** | `5cea36c` | `/manifest.json` → `application/manifest+json` بينما كل `.json` عام ← `application/json` |
| CB-06 ازدواج `.file-name` | **مُصلَح** | `7161f50` | القاعدة الموحّدة في `components.css`: حسابياً mono + `11.5px` + `max-width: 460.8px` (**30vw** عند 1536px) و**140px** (**20vw** عند 700px — التجاوز الناعم نُقل إلى `components.css` لكي لا تطغى قاعدة التحميل الأحدث على `@media`) على `#statusFile` وقائمة الملفات معاً |
| CB-07 `editText` المفقودة | مغلق (false-positive) | — | صفر إشارات في الكود عند HEAD (تحقيق 2026-11-02)؛ إغلاق YAGNI دون أي تغيير كود |
| التسجيل config/SW | **مُصلَح** | `8d3f511` ثم `7fcd156` | انزياح الإصدارات عولج أولاً بمواءمتها عند `1.0.3`؛ ثم كشف دليل حي مشكلة أعمق (انظر أدناه) فصعد كلاهما إلى **`1.0.4`** |

### اكتشاف حي إضافي: تسليم متسخ عند تغيير الأصول دون ترقية كاش SW

خلال تحقق المتصفح ظهرت صفحة **مختلطة** (config.js `1.0.0` قديم + files.js قبل إصلاح duplicate) رغم أن القرص يضم الملفات المصلحة: `service-worker.js` بذاته لم يتغير بعد `1111bab`، فلم تُسجِّل `registration.update()` أي تغيير، ولم تُعاد تعبئة الكاش. أي مستخدم PWA مثبّت كان سيبقى بصفة قديمة مقطوعة إلى الأبد. الحل = رفع `VERSION` في SW إلى `kingcode-v1.0.4` (الكوميت `7fcd156`) مع `kc.version`؛ معالج `activate` الموجود يحذف الكاشات القديمة تلقائياً (فحص حي: كاش وحيد `kingcode-cache-kingcode-v1.0.4` بعد إعادة التحميل، وإصدار الصفحة `kingCode 1.0.4`).
**النمط المُلزم مستقبلاً:** كل تغيير أصل يتطلب رفعة كاش SW في نفس الكوميت.

---

## Security Vulnerabilities

| # | Description | Severity | File | Evidence |
|---|-----------|----------|------|---------|
| SC-01 | **Server-side Request Forgery (SSRF) potential** — `path.normalize(urlPath)` insufficient; can escape ROOT boundary via `../` sequences not fully normalized | **Critical** | `tools/server.js:46-50` | `if (!filePath.startsWith(ROOT))` check after `normalize()` — but `decodeURIComponent` can throw, and paths like `/../etc/passwd` may bypass |
| SC-02 | **Unsafe HTML rendering in preview** — `injectConsoleBridge` injects raw `console` overrides; `srcdoc` iframe may execute untrusted content from user projects | **High** | `js/preview.js:155-191` | `inject()` method replaces `<link rel=stylesheet>` and `<script src=>` with embedded content; if user imports external URLs, they may execute in sandbox |
| SC-03 | **localStorage exposure** — all project data stored in plaintext `localStorage`; no sandbox isolation between tabs; shared across same-origin tabs | **Medium** | `js/utils.js:40-58`, `js/state.js:88-106` | `U.storage.get/set` with no encryption; `storageKey` versioning only |
| SC-04 | **CSP not enforced** — no `<meta http-equiv="Content-Security-Policy">` in `index.html`; sandbox attribute on iframe is permissive | **Medium** | `index.html:111` | `sandbox="allow-scripts allow-forms allow-modals allow-popups"` — allows forms and mods; missing `allow-same-origin` restriction and `script-src` directive |
| SC-05 | **No input validation on file imports** — `importProject()` parses raw JSON without schema validation; `sanitizeFiles()` only checks basic structure | **Medium** | `js/files.js:172-199`, `js/utils.js:114-125` | Malformed JSON or unexpected structure may cause runtime errors; no MIME/type validation |
| SC-06 | **Console bridge has no origin validation** — `postMessage` to `window.parent` uses `*` target; preview iframe could be hijacked | **Medium** | `js/preview.js:155-191` | `window.parent.postMessage({__kingcode: true...}, '*')` — no `targetOrigin` restriction |
| SC-07 | **Service Worker cache poisoning** — `backgroundUpdate()` blindly caches any fetched response; no response validation | **Low** | `js/service-worker.js:98-106` | `cache.put(request, res.clone())` for any 200 response; could cache malicious content |

---

## Performance Issues

| # | Description | Impact | File |
|---|-----------|--------|------|
| PE-01 | **CodeMirror 5 vs CodeMirror 6** — CodeMirror 5 is unmaintained; larger bundle; poorer mobile performance | High | `vendor/codemirror/` (33 files, ~1.2MB uncompressed) |
| PE-02 | **localStorage size pressure** — no quota handling; projects >5MB will silently fail | Medium | `js/utils.js:62-71` |
| PE-03 | **Double event binding** — `STATE.on('pref:sidebarOpen', ...)` in `ui.js` + potential re-binding on route changes | Medium | `js/ui.js:478`, `js/state.js:73-78` |
| PE-04 | **Memory leak in docs Map** — `EDITOR.docRec()` creates new `CodeMirror.Doc` but never clears on file removal; `docModeChanged` only deletes from Map, may leak | Medium | `js/editor.js:100-110` |
| PE-05 | **Preview iframe rebuild on every schedule** — `buildDocument()` re-parses all file contents each debounce cycle; no diffing | Medium | `js/preview.js:30-35` |
| PE-06 | **No code splitting** — all CodeMirror modes + addons loaded upfront; ~1.2MB+ JS on first paint | Medium | `index.html:228-250` |

---

## UI/UX Problems

| # | Description | Severity | File |
|---|-----------|----------|------|
| UI-01 | **Arabic RTL mixed with English LTR** — cursor position, status bar some elements use `dir="ltr"` inconsistently; `statusPos` direction rtl vs ltr conflicts | Medium | `index.html:42-45`, `css/main.css:158-163` |
| UI-02 | **Mobile tab bar overflow** — on narrow screens tab labels overflow; no ellipsis truncation strategy beyond max-width | Medium | `css/components.css:193-199` |
| UI-03 | **Preview always below editor on mobile** — `view-mobile` layout stacks vertically but `splitter` removed; may feel cramped | Low | `css/main.css:350-360` |
| UI-04 | **Edge-toggle button appears on desktop too** under certain viewport widths; no `view-desktop` guard in all media queries | Low | `css/components.css:597-621` |
| UI-05 | **No focus-visible states for all interactive elements** — some buttons lack proper `:focus-visible` fallback | Low | `css/main.css:416-424` |
| UI-06 | **Command palette max 14 results** — truncation may hide important commands; no pagination | Low | `js/ui.js:124` |
| UI-07 | **Toast auto-removal uses setTimeout only** — no `raf`-based alignment with render frame; may appear stale | Low | `js/ui.js:364-368` |

---

## Missing Capabilities

| Category | Missing | Priority |
|----------|---------|----------|
| **Git Integration** | None — explicitly noted as not implemented (README line 88) | Critical |
| **Extensions/MCP** | No extension system; no Plugin API | Critical |
| **AI Assistant** | No AI provider abstraction; no code explain/generate | High |
| **Real Terminal** | No shell execution; only console bridge in preview | High |
| **Multi-editor** | Single CodeMirror instance; no tab-specific editors | Medium |
| **Rich Format Export** | HTML export only; no PDF, RTF, or other formats | Medium |
| **Version Control** | No undo/redo stack beyond autosave | Medium |
| **Unit/Integration Tests** | None observed | High |
| **Accessibility Audit** | Partial — ARIA labels present but focus order may be inconsistent | Medium |
| **Dark Mode Media Query** | `prefers-color-scheme` not leveraged | Low |
| ** offline Support Beyond SW** | No IndexedDB; pure localStorage limits persistence | Medium |
| **Language Server Protocol** | No LSP support; basic autocomplete only | Low |
| **User Preferences Persistence Beyond localStorage** | No server backend for roaming profiles | Low |

---

## Recommended Libraries & Technologies

| Area | Recommendation | Rationale |
|------|-------------|-----------|
| **Editor** | Consider CodeMirror 6 or Monaco Editor | CM6 is maintained; Monaco has better language support but larger bundle |
| **State Mgmt** | Keep custom pub/sub or migrate to tiny Mediator pattern | Current implementation is lightweight and functional |
| **Storage** | Consider `idb-keyval` or `localforage` for better quota management | Wraps IndexedDB with fallback to localStorage |
| **Service Worker** | Workbox or manual Cache + Stale-while-revalidate | Current SW is minimal; Workbox adds robust strategies |
| **PWA** | Add `<meta http-equiv="Content-Security-Policy">` | Security best practice |
| **Build** | Vite or esbuild for dev server + HMR | Replaces custom Node server; faster rebuilds |
| **Testing** | Vitest + Playwright for unit + E2E | Modern maintained stack |
| **Linting** | ESLint + Prettier | Improves code quality consistency |
| **CSS** | PostCSS + CSS variables already in use; keep current token system | Already well-structured |
| **AI Integration** | Provider abstraction (OpenAI, Anthropic, etc.) with streaming | Foundation for Phase 11 |

---

## Prioritized Development Roadmap

### Phase 0 (Complete) ✅ — Repository Audit
- [x] Evidence collection and documentation
- [x] Architecture mapping
- [x] Bug/Security inventory

### Phase 1 — Critical Repairs (Weeks 1-2)
- [ ] Fix `pref:sidebarOpen` infinite recursion in `state.js` (CB-01)
- [ ] Add try/catch around `decodeURIComponent` in `server.js` (CB-02)
- [ ] Consolidate duplicate `.file-name` CSS rules (CB-03)
- [x] `editText`: zero references remain in code — closed as stale/false positive (2026-11-02)
- [ ] Verify Service Worker update reliably clears old caches

### Phase 2 — Code Editor Modernization (Weeks 3-6)
- [ ] Evaluate CodeMirror 6 vs Monaco vs keep CM5
- [ ] If staying CM5: upgrade modes, fix double bindings
- [ ] If migrating: plan migration path, bundle size impact
- [ ] Implement intelligent autocomplete (behind abstraction)
- [ ] Add code folding, minimap, bracket matching enhancements
- [ ] Support additional languages: Java, C, C++, Go, Rust

### Phase 3 — Professional Project Management (Weeks 7-10)
- [ ] Reliable file operations (create/rename/delete/duplicate)
- [ ] Search/files with proper debouncing
- [ ] Autosave with conflict detection
- [ ] Recent projects list
- [ ] Import/export with validation
- [ ] Dirty-file indicators + unsaved changes protection

### Phase 4 — Live Preview & Execution (Weeks 11-14)
- [ ] Safe execution boundaries design
- [ ] For interpreted languages: design backend execution architecture
- [ ] Do NOT claim language execution without implementation
- [ ] Preview isolation refinement

### Phase 5 — Integrated Terminal & Runtime (Weeks 15-18)
- [ ] Investigate secure remote execution or isolated backend
- [ ] For desktop: evaluate terminal integration (pty, bash)
- [ ] Browser: web worker-based terminal or remote execution
- [ ] Command history + output display + process management

### Phase 6 — Git Integration (Weeks 19-22)
- [ ] Choose appropriate implementation (simple JS git library, or secure remote)
- [ ] Never store credentials in frontend source
- [ ] Secure authentication flow for remote repos

### Phase 7 — KingCode AI Assistant (Weeks 23-26)
- [ ] Provider abstraction layer
- [ ] Secure API configuration (never hardcode keys)
- [ ] Streaming responses
- [ ] Context management
- [ ] Error handling + usage limits
- [ ] User-controlled settings

### Phase 8 — Extensions & MCP Architecture (Weeks 27-30)
- [ ] Extension manifest system
- [ ] Permission model before third-party plugins
- [ ] MCP client integration (protocol-compliant)
- [ ] Plugin isolation boundaries

### Phase 9 — Professional UI/UX (Weeks 31-34)
- [ ] Design system: tokens, spacing, typography
- [ ] Desktop: resizable panels, command palette, status bar
- [ ] Mobile: touch-friendly, responsive, no horizontal overflow
- [ ] Accessibility: contrast, focus-visible, ARIA refinement

### Phase 10 — Testing & QA (Weeks 35-38)
- [ ] Unit tests for utilities + state modules
- [ ] Integration tests for editor + file manager + preview
- [ ] E2E tests for critical workflows
- [ ] Security tests for preview isolation + imports
- [ ] Responsive tests: desktop, tablet, mobile

### Phase 11 — Performance & Production Readiness (Weeks 39-44)
- [ ] Bundle size optimization (code splitting, dynamic imports)
- [ ] Startup performance measurement
- [ ] Large project handling (localStorage limits)
- [ ] Memory usage profiling
- [ ] Production configuration

### Phase 12 — Documentation & Release (Weeks 45-48)
- [ ] Update README, CONTRIBUTING, CHANGELOG
- [ ] Architecture documentation
- [ ] Installation & development instructions
- [ ] Deployment documentation
- [ ] Security documentation
- [ ] Testing documentation
- [ ] `docs/RELEASE_READINESS.md`

---

## Testing Strategy

### Unit Tests (Vitest)
- `utils.js`: `escapeHtml`, `clamp`, `debounce`, `safeFileName`, `sanitizeFiles`, `storage` operations
- `state.js`: `hydrate`, `persist`, `setActive`, `setSetting`, `markDirty`, event bus
- `editor.js`: `open`, `docModeChanged`, `setFontSize`, `applyTheme`, `applyTabSize`
- `files.js`: `create`, `rename`, `remove`, `duplicate`, `saveFile`, `importProject`, `importFiles`
- `preview.js`: `buildDocument`, `inject`, `injectConsoleBridge`, `schedule`, `refresh`

### Integration Tests
- Editor ↔ File manager: open/close files, tab switching, content sync
- Storage: persist/hydrate round-trip, version migration, conflict handling
- Preview: auto-refresh, manual refresh, console bridge, iframe sandbox
- File operations: create/rename/delete/duplicate/import/export flow end-to-end
- UI: command palette search, modal open/close, theme toggle, responsive breakpoints

### End-to-End Tests (Playwright)
- Full workflow: new project → edit → save → preview → export → import
- Mobile workflow: touch interactions, responsive layout, sidebar toggle
- PWA: install, offline refresh, update detection
- Keyboard shortcuts: all Ctrl+/Cmd shortcuts
- Error states: storage quota exceeded, max files reached, invalid imports

### Security Tests
- Malicious HTML input in editor → preview isolation verification
- Invalid JSON import → error handling, no crash
- Storage boundary testing (approach quota)
- Preview iframe sandbox permission verification
- CSP header presence check

---

## Estimated Complexity per Phase

| Phase | Estimated Duration | Complexity | Risk |
|-------|-------------------|------------|------|
| 1 — Critical Repairs | 1-2 weeks | Low-Medium | Low (bug fixes) |
| 2 — Code Editor | 3-6 weeks | Medium | Medium (migration risk) |
| 3 — Project Management | 2-4 weeks | Medium | Medium (state complexity) |
| 4 — Preview & Execution | 2-3 weeks | Medium-High | High (sandbox/security) |
| 5 — Terminal & Runtime | 2-3 weeks | Medium-High | High (execution security) |
| 6 — Git Integration | 2 weeks | Medium | Medium (auth flow) |
| 7 — AI Assistant | 3-4 weeks | High | High (API keys, provider coupling) |
| 8 — Extensions & MCP | 2-3 weeks | Medium-High | Medium (permission model) |
| 9 — UI/UX | 3-4 weeks | Medium | Low (cosmetic) |
| 10 — Testing | 3-4 weeks | Medium | Medium (test maintenance) |
| 11 — Performance | 2-3 weeks | Medium | Low |
| 12 — Documentation | 1-2 weeks | Low | Low |

**Total Estimated:** ~18-30 weeks for full production-ready transformation

---

## Next Steps

1. **Present findings** to stakeholder for approval
2. **Begin Phase 1** — Critical repairs (CB-01 sidebar recursion is blocking further development)
3. **Document** all changes with git commits
4. **Run verification** after each fix
5. **Proceed phases** only when acceptance criteria met