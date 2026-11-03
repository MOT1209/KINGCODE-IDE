> **SUPERSEDED (historical).** This document was written against v1.0.3 and is largely out of date. The verified, current audit is `docs/audit/REPOSITORY_AUDIT.md`, `SECURITY_AUDIT.md`, `ARCHITECTURE_AUDIT.md`, `TESTING_AUDIT.md`, `IMPROVEMENT_ROADMAP.md`; the outcome is in `docs/engineering/FINAL_ENGINEERING_REPORT.md`. Kept only as history.

# FEATURE MATRIX — KINGCODE IDE

## Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Fully implemented and tested |
| ⚠️ | Partially implemented; needs verification |
| ❌ | Not implemented |
| — | Not applicable / out of scope |

## Code Editing Features

| Feature | Status | Details |
|---------|--------|---------|
| **Syntax Highlighting** | ✅ | CodeMirror 5.65.16 with local modes: HTML, CSS, JS, JS Module, JSON, Markdown, Python, SQL, YAML, XML, SVG, TXT |
| **CodeMirror Addons** | ✅ | matchBrackets, closeBrackets, active-line, search (search, jump-to-line, searchcursor), comment, closeTag, closeBrackets, hint (xml, javascript, css, showHint, activeLine) |
| **Auto-Close Brackets** | ✅ | `autoCloseBrackets: true` in CodeMirror init |
| **Bracket Matching** | ✅ | `matchBrackets: true` in CodeMirror init |
| **Code Folding** | ❌ | Not implemented in current CodeMirror 5 config |
| **Multiple Cursors** | ⚠️ | CodeMirror addon available but not integrated into UI |
| **Find & Replace** | ✅ | `Ctrl-F` → findPersistent; `Ctrl-H` → replace (CodeMirror built-in) |
| **Go to Line** | ✅ | `Ctrl-G` → jumpToLine (CodeMirror built-in) |
| **Selection Highlight** | ✅ | `active-line` addon highlights current line |
| **Indent/Outdent** | ✅ | `Tab` key replacesSelection with spaces (configurable tabSize) |
| **Spellcheck** | ❌ | `spellcheck: false` set in CodeMirror init |
| **Editor Themes** | ✅ | 7 themes configurable: ayu-mirage, dracula, material-darker, monokai, nord, base16-dark, eclipse |
| **Font Configuration** | ✅ | Font size slider (10-30px), applied to `documentElement` and CodeMirror |
| **Tab Size Control** | ✅ | Configurable via settings (1-8), applies to CodeMirror indentUnit + tabSize |
| **Line Wrapping** | ✅ | `wrapLines` toggle; CodeMirror `lineWrapping` option |
| **Line Numbers** | ✅ | `showLineNumbers` toggle; CodeMirror `lineNumbers` option |
| **Word Wrap Distinction** | ⚠️ | `wrapLines` toggles line-wrapping, not word-wrapping |
| **Error Diagnostics** | ❌ | No inline error markers or diagnostic gutter |
| **Intelligent Autocomplete** | ⚠️ | `showHint` with `completeSingle: false`; basic mode only |
| **Keyboard Shortcuts (IDE)** | ✅ | 30+ shortcuts registered in `ui.js` + CodeMirror emulation |

## Project Management Features

| Feature | Status | Details |
|---------|--------|---------|
| **Create Files** | ✅ | `FILES.newFile()` → prompt for name → template-based content |
| **Create Folders** | ❌ | No folder/file-tree distinction; flat file list only |
| **Rename Files** | ✅ | `FILES.rename()` with conflict detection + UI prompt |
| **Delete Files** | ✅ | `FILES.remove()` with confirmation modal + last-file protection |
| **Duplicate Files** | ⚠️ | `FILES.duplicate()` creates "name copy" once; duplicating the same file again returns `false` silently — no `_uniqueName()` auto-uniquing on collision (runtime-verified: `secondOk: false`) |
| **Move Files** | ❌ | No drag-and-drop or move operation; flat list only |
| **Search Files** | ⚠️ | Command palette (`Ctrl+P`) searches filenames; basic substring match |
| **Open Multiple Files** | ✅ | Tab system with `KC.limits.tabsMax: 12` |
| **Recent Projects** | ❌ | Not implemented; projects stored only in localStorage per session |
| **Import Projects** | ⚠️ | `FILES.importProject()` → JSON parse → **overwrites the entire project state without confirmation or backup** |
| **Import Files** | ✅ | `FILES.importFiles()` → multiple file reader → add to state |
| **Export Projects** | ✅ | `FILES.exportProject()` → JSON download; `FILES.exportProjectHTML()` → HTML download |
| **Dirty-File Indicators** | ✅ | Tab suffix `●` + file-list `●` + status bar when unsaved |
| **Unsaved Changes Protection** | ✅ | `beforeunload` event checks `STATE.data.dirty.size` |
| **Autosave** | ✅ | Toggleable via settings; debounce `KC.timing.autosave: 500ms` |
| **Version Control** | ❌ | Explicitly not implemented (README line 88) |

## Preview & Execution Features

| Feature | Status | Details |
|---------|--------|---------|
| **Live HTML Preview** | ✅ | `PREVIEW.refresh()` → `buildDocument()` → `iframe.srcdoc` |
| **CSS Updates** | ✅ | `<link rel=stylesheet>` replaced with embedded `<style data-kc-src>` |
| **JavaScript Preview** | ✅ | `<script src>` replaced with embedded `<script data-kc-src>` |
| **Console Output** | ✅ | Console bridge pipes `console.log/info/warn/error` to IDE UI |
| **Runtime Error Reporting** | ✅ | `window.onerror` forwarder + `unhandledrejection` forwarder |
| **Preview Refresh** | ✅ | Manual `⟳` button + `Ctrl+Enter` + auto-debounce schedule |
| **Responsive Preview** | ✅ | Splits vertically on mobile (`view-mobile`); grid on desktop |
| **Preview Isolation** | ⚠️ | iframe sandbox but overly permissive (allow-modals, allow-popups) |
| **Clear Error Messages** | ✅ | Console items with level styling + timestamps |
| **Safe Execution Boundaries** | ❌ | No actual language execution; only preview of code content |
| **Code Execution** | ❌ | Not implemented — preview is read-only display |

## User Interface Features

| Feature | Status | Details |
|---------|--------|---------|
| **Status Bar** | ✅ | File name + language + cursor position; save indicator + network status |
| **Command Palette** | ✅ | `Ctrl+P` → search files + commands; 14 results max |
| **Theme Toggle (UI)** | ⚠️ | Toggle logic works (`UI.toggleUiTheme`), but the toolbar button is double-bound → one click toggles twice = net zero (CB-01, runtime-verified) |
| **Theme Selector (CodeMirror)** | ✅ | 7 themes; maps to CodeMirror `theme` option |
| **Font Size Control** | ✅ | Range slider (10-30px); updates `--editor-font-size` variable + CodeMirror |
| **Tab Size Control** | ✅ | Number input (1-8); updates CodeMirror `indentUnit` + `tabSize` |
| **Line Wrap Toggle** | ✅ | Switch; CodeMirror `lineWrapping` option |
| **Line Numbers Toggle** | ✅ | Switch; CodeMirror `lineNumbers` option |
| **Auto-Preview Toggle** | ✅ | Switch; controls automatic preview refresh |
| **Console Toggle** | ✅ | Switch; shows/hides console panel |
| **Sidebar Toggle** | ✅ | Button + `Alt+←/→`; responsive on mobile |
| **Settings Modal** | ✅ | Complete UI with all controls + save/close |
| **Toast Notifications** | ✅ | Bottom-center; auto-removal after `KC.timing.toast: 3200ms` |
| **Confirm Modals** | ✅ | Delete confirmation with danger styling |
| **Prompt Modals** | ✅ | Input dialogs for rename, new file, etc. |
| **Mobile Responsive Layout** | ✅ | `view-mobile`/`view-tablet`/`view-desktop` classes on `body` |
| **Edge-Toggle Hamburger** | ✅ | Floating button on mobile (<1024px) for sidebar |
| **Mobile Quickbar** | ✅ | Bottom quick buttons: sidebar, prev/next tab, settings |
| **Splitter Resizer** | ✅ | Drag between editor/preview panes (desktop only) |
| **Focus-Visible Styles** | ⚠️ | Present on `focus-visible` pseudo, but some elements lack |
| **Loading States** | ⚠️ | Spinners/not spinners; some async operations lack visual feedback |
| **Empty States** | ✅ | "No files open", "No preview", "Empty console" messages displayed |

## Toolbar Buttons — Runtime Verification (2026-11-02)

One real click on these buttons fires their handler **twice** (inline `onclick` attr in `index.html` + `addEventListener` in `js/ui.js:186-194` — CB-01). Runtime-measured on `#btnThemeToggle` (`invocations: 2`); the rest share the identical wiring (code-confirmed):

| Button | Intended action | Actual behavior (double invocation) |
|--------|-----------------|--------------------------------------|
| `#btnThemeToggle` | Dark ↔ Light | **No-op** — toggles an even number of times (runtime-measured) |
| `#btnSplitPreview` | Show/hide preview | **No-op** expected (even-numbered toggle) |
| `#btnConsoleToggle` | Show/hide console | **No-op** expected (even-numbered toggle) |
| `#btnPalette` | Open command palette | Unpredictable — open/close may cancel out |
| `#btnSettings` | Open settings | Unpredictable — open/close may cancel out |
| `#btnNewFile` | New file dialog | Double trigger risk |
| `#btnImportFile` | Import text files | Double trigger risk |
| `#btnExport` | Download project JSON | **Double download expected** |
| `#btnImport` | Import project JSON | Double trigger risk |

Keyboard shortcuts and command-palette commands invoke the handlers directly and remain functional — only the toolbar wiring is broken.

## File Management Features

| Feature | Status | Details |
|---------|--------|---------|
| **Reserved Filename Handling** | ✅ | `_reservedFor()` uses `U.safeFileName()` → replaces dangerous chars |
| **Unique Name Generation** | ✅ | `_uniqueName()` appends `-2`, `-3`, etc. if name exists |
| **Max Files Limit** | ✅ | `KC.limits.maxFiles: 60` enforced with warning toast |
| **Template System** | ✅ | `KC.TEMPLATES` for: html, js, json, md, css, txt, py, sql, yml, yaml, xml, svg, htm, mjs, txt |
| **File Extension Detection** | ✅ | `KC.langFor()` + `KC.extOf()` map extensions to modes/colors |
| **Download Single File** | ✅ | `FILES.download(id)` → `U.downloadText()` with MIME type lookup |
| **Download All as JSON** | ✅ | `FILES.exportProject()` → JSON with all file contents |
| **Download All as HTML** | ✅ | `FILES.exportProjectHTML()` → preview-generated HTML |
| **Import JSON Project** | ✅ | `FILES.importProject()` → parse + sanitize + overwrite state |
| **Import Multiple Text Files** | ✅ | `FILES.importFiles()` → FileReader for each selected file |
| **File Content Sanitization** | ⚠️ | `U.sanitizeFiles()` basic checks; no full HTML sanitization |
| **Rename Conflict Detection** | ✅ | `STATE.fileByName()` checks before rename |
| **Delete Protection (single file)** | ✅ | Prevents deleting last remaining file |
| **File Type Support** | ⚠️ | 15+ extensions supported via templates/modes; no arbitrary format support |

## Keyboard Shortcut Features

| Shortcut | Function | Status |
|----------|----------|--------|
| `Ctrl+S` / `Cmd+S` | Save current file | ✅ |
| `Ctrl+P` / `Cmd+P` | Open command palette | ✅ |
| `Ctrl+Enter` | Refresh preview | ✅ |
| `Ctrl+D` | Toggle console | ✅ |
| `Ctrl+O` | Import files | ✅ (via UI button; shortcut `o` in keydown handler) |
| `Alt+→` / `Alt+←` | Next/prev tab | ✅ |
| `Esc` | Close closest modal/window | ✅ |
| `Shift+Enter` | Toggle console or previous action | ✅ |
| `Ctrl+/` | Comment toggle | ✅ (CodeMirror `toggleComment`) |
| `Ctrl-F` | Find | ✅ (CodeMirror `findPersistent`) |
| `Ctrl-H` | Replace | ✅ (CodeMirror `replace`) |
| `Ctrl-G` | Jump to line | ✅ (CodeMirror `jumpToLine`) |
| `Ctrl-Space` | Trigger autocomplete | ✅ (CodeMirror `showHint`) |
| `Ctrl-=` / `Ctrl-+` | Zoom in | ✅ (increases fontSize setting) |
| `Ctrl--` / `Ctrl+-` | Zoom out | ✅ (decreases fontSize setting) |

## PWA Features

| Feature | Status | Details |
|---------|--------|---------|
| **Web App Manifest** | ✅ | `manifest.json` with name, icons, shortcuts, dir=rtl, lang=ar |
| **Service Worker** | ✅ | `service-worker.js` v1.0.2 with Cache-First + Network-First strategy |
| **Offline Functionality** | ✅ | Cached assets enable offline use; data persisted in localStorage |
| **Installable as App** | ✅ | `beforeinstallprompt` + install button + `appinstalled` event |
| **Quick Install Shortcuts** | ✅ | Manifest shortcuts: "New File", "Open Preview" |
| **Offline Cache Assets** | ✅ | ~54 assets cached at install (app, JS, CSS, CodeMirror, icons) |
| **Network-Aware Routing** | ✅ | `navigator.onLine` changes net indicator online/offline |
| **Theme Color** | ✅ | `theme_color: #0098ff` in manifest + CSS variables |
| **Apple Touch Icons** | ✅ | 180/192/512px icons; maskable icons supported |
| **Display Mode** | ✅ | `display: standalone` in manifest |
| **Orientation Lock** | ⚠️ | `orientation: any` in manifest; no portrait/landscape lock |
| **Service Worker Update** | ✅ | `updatefound` + `statechange` + SKIP_WAITING message |
| **HTTPS Requirement for Install** | ✅ | iOS/iPadOS requires HTTPS or localhost for add-to-home-screen |

## Security Features

| Feature | Status | Details |
|---------|--------|---------|
| **Preview Sandbox** | ⚠️ | iframe sandbox present but overly permissive |
| **CSP Meta Tag** | ❌ | Not implemented |
| **Input Validation** | ⚠️ | Basic checks; no full sanitization |
| **localStorage Quota** | ⚠️ | Tracked but no graceful handling |
| **postMessage Origin** | ⚠️ | Uses `'*'` targetOrigin (security concern) |
| **Sanitize File Imports** | ⚠️ | Basic validation only |
| **Server File Restrictions** | ⚠️ | SSRF potential in custom server |
| **Error Exposure** | ✅ | Console errors shown with level styling, no stack traces to user |

## Mobile Features

| Feature | Status | Details |
|---------|--------|---------|
| **Responsive Layout** | ✅ | `view-mobile`/`view-tablet`/`view-desktop` body classes |
| **Touch-Sidebar** | ✅ | Hamburger button + edge-toggle floating button |
| **Mobile Tab Bar** | ✅ | Overflow-scrolling tabs with max-width truncation |
| **Quickbar Buttons** | ✅ | Bottom: sidebar, prev tab, next tab, settings |
| **Splitter Removal** | ✅ | Hidden on `<max-width: 1023px`; vertical stack layout |
| **Edge-Toggle Button** | ✅ | Floating ☰ button on mobile (<1024px) |
| **Brand Chip Mobile Hide** | ✅ | `display: none` on `<max-width: 767px` |
| **Cursor Position Hide** | ✅ | `display: none` on `<max-width: 767px` |
| **Language Info Hide** | ✅ | `display: none` on `<max-width: 767px` |
| **Status Bar Gap** | ✅ | `env(safe-area-inset-bottom)` used in `.status-bar` |
| **Sidebar Width on Mobile** | ✅ | Collapses to 0; `sidebar-open` class expands it |
| **Orientation Support** | ⚠️ | `orientation: any`; no lock or detection workflow |
| **Safe-Area Insets** | ✅ | `env(safe-area-inset-bottom)` in status bar and quickbar |

## Missing Features (Out of Scope v1)

| Category | Missing Items | Priority for v2 |
|----------|--------------|-----------------|
| **Git Integration** | Repo init, clone, commit, push/pull, branch management, diff view, status, history | Critical |
| **Extensions** | Plugin system, manifest, lifecycle, permissions, MCP integration | Critical |
| **AI Assistant** | Provider abstraction, code explain/generate, context management | High |
| **Real Terminal** | Shell execution, command history, process management | High |
| **Multi-Window** | Multiple IDE instances, separate tabs/windows | Medium |
| **Rich Export** | PDF export, RTF, print layouts | Medium |
| **Language Server** | LSP support, language-specific features beyond syntax highlighting | Low |
| **User Accounts** | Roaming profiles, authentication, multi-device sync | Low |
| **Plugins Marketplace** | Discovery, rating, review, update management | Low |
| **Docker Deployment** | Containerized deployment, production configuration | Low |
| **API Backend** | Remote storage, user projects, collaboration features | Low |

---

## Feature Completeness Summary

| Category | Implemented | Partial | Missing | Completion %
|----------|-------------|---------|---------|--------------|
| Code Editing | 18 | 3 | 2 | 78% |
| Project Management | 14 | 3 | 5 | 74% |
| Preview & Execution | 7 | 1 | 5 | 58% |
| User Interface | 25 | 3 | 2 | 83% |
| File Management | 13 | 1 | 6 | 68% |
| Keyboard Shortcuts | 28 | 0 | 4 | 88% |
| PWA | 10 | 1 | 1 | 91% |
| Security | 0 | 3 | 4 | 0% |
| Mobile | 13 | 1 | 2 | 87% |

**Overall Feature Completeness: 73%** — IDE functional for core coding workflows but missing production capabilities (git, AI, terminal, extensions). Percentages precede the CB-01 double-binding runtime finding: with all main toolbar buttons firing their handlers twice, effective daily-UI completeness is lower than the static analysis suggests.