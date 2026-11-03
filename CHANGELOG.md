# Changelog

توضّح هذه الوثيقة كل تغيير مهم في المشروع. الترقيم دلالي (SemVer) والصيغة مستندة إلى Keep a Changelog.
This document records all notable changes to the project (semver, Keep a Changelog style).

## [1.4.2] — 2026-11-03

Cross-browser verification: the E2E suite now runs on **Chromium, Firefox and WebKit** in CI (`KC_BROWSER`, matrix job `e2e`).

### Fixed

- **IndexedDB connection ignored `versionchange`.** Another tab deleting or upgrading the database (clearing site data, a future schema change) was blocked for as long as an older tab kept its connection open; WebKit exposed it (deletes hung, a migration test failed). The connection is now closed on `versionchange` and reopened on the next save, which rewrites every file (the known-record set is reset). E2E `A-01: another tab deleting the database…`.
- **Safari/WebKit showed `Script error. @ line 0` for runtime errors in the preview** (WebKit masks the message and line of uncaught errors in opaque-origin documents). The console bridge now says why details are missing and what to do (`console.log`, `try/catch`, or another browser) instead of printing a meaningless position; other browsers still show the real message and line.

### Tests

- `tools/e2e.js` runs against any engine (`KC_BROWSER=chromium|firefox|webkit`). Test-suite fixes found by the new engines (not product bugs): Firefox downloads `manifest.json` instead of navigating to it (tests now use a neutral same-origin page); WebKit reports the sandbox's blocked top-navigation attempt as a page error (expected, now filtered); a `waitConsole` helper reports the real console text when it times out.
- CI results on the pull request head: Chromium 48/48, Firefox 48/48; WebKit 47/48 before this fix (the masked error above), see the PR for the final run. Unit 44 (core 32, preview 12), E2E 48.

### Meta

- Version 1.4.2 (`KC.version`, SW cache `kingcode-v1.4.2`, `package.json`).

## [1.4.1] — 2026-11-03

### Fixed

- **Crash journal could corrupt a migrated project (found by CI, reproduced locally).** If a save was still pending when the page was reloaded, the exit handler wrote a crash journal of *changed files only*; on the next boot that partial journal was merged into the project migrated from the legacy `localStorage` blob (which has no `savedAt`), mixing unrelated files into it — and a partial journal found with no saved project at all would have become the whole project. Rules now: a journal marked `full` (written while *all* files were pending: first save, import, migration) is a complete project and is applied as a replacement when newer than the last save; a partial journal is applied only on top of a real new-format snapshot (`savedAt`, not migrated); anything else is discarded and cleared. Regression: unit tests (partial journal never leaks into legacy/migrated/absent snapshots; full journal is used alone but not when older than the last save) and E2E (an upgrading user who edits immediately and reloads keeps the migrated project plus the edit).
- E2E `A-01 legacy migration` was timing-dependent in CI (passed in 3 local runs, failed on GitHub): it now finishes any pending save of the page it started from before swapping in the legacy blob, which is what a real upgrade looks like.

### Tests

- Unit 43 (core 32, preview 11), E2E **47** (+1).

### Meta

- Version 1.4.1 (`KC.version`, SW cache `kingcode-v1.4.1`, `package.json`).

## [1.4.0] — 2026-11-03

Phase 5 (UI/UX): responsive layouts designed per device class instead of shrinking the desktop UI.

### Changed

- **Phone (< 768 px):** one full-height pane at a time — editor, or preview + console — switched by a labelled **bottom navigation bar** (Files | Editor | Preview | Settings) in normal flow (it no longer floats over the code/console), touch targets ≥ 44 px, `aria-pressed`/`aria-expanded` state. Before: editor and preview were stacked 50/50 with the console covering most of the preview and floating buttons over the code. Choosing a file closes the drawer and shows the editor.
- **Tablet (768–1023 px):** the file drawer starts **closed** (it used to open over the editor on first run), is opened from a new toolbar ☰ button (`#btnSidebar`, `aria-expanded`), and is not persisted. On desktop the sidebar choice is saved as before and is no longer overwritten by passing through a phone-sized window.
- The floating burger (`edge-toggle`) and the pill-shaped quick bar were removed.

### Fixed

- Tapping the dimmed overlay behind the drawer did nothing; it now closes the drawer, and `Esc` closes it too.

### Tests

- **E2E 46** (+4, each at its own viewport and input mode): phone single-pane flow with 44 px targets and no overflow; phone drawer lifecycle (closed → open → closes after picking a file → not persisted); tablet drawer, overlay and Esc; desktop persistence across a phone-size round trip.

### Meta

- Version 1.4.0 (`KC.version`, SW cache `kingcode-v1.4.0`, `package.json`).

## [1.3.0] — 2026-11-03

Phase 3 complete (A-06, T-05, T-07) + Phase 4 editor verification.

### Fixed

- **Alt+→ / Alt+← did nothing inside the editor.** CodeMirror's key map (→ next, ← previous) and the global handler (which treated ← as *next*) both ran and cancelled each other. The global handler now ignores events CodeMirror already handled and uses the same meaning everywhere (→ next, ← previous, matching the LTR tab strip and the README). Verified red on the old handler, green now (E2E `Alt+Arrow`).

### Changed

- **`js/ui.js` (700 lines) split** into `js/commands.js` (command registry + definitions), `js/palette.js` (command palette) and `js/ui.js` (modals, toasts, console, settings, shortcuts, responsive, install). No behavior change; `sandbox`, tests and precache list updated (A-06).
- **ESLint added (dev-only)** with a config that declares the app's cross-file globals, so typos between scripts fail the build (T-07). First run found and I fixed: a property access split across lines in `files.js`, dead assignments, redundant escapes. CI gains a `lint` job.

### Tests

- **E2E 42** (+6): real two-version **service-worker update** (new worker waits; no automatic reload; edit survives `applyUpdate`; only `kingcode-cache-*` caches are cleaned and a foreign cache is kept), editor search (Ctrl+F) and replace (Ctrl+H), Ctrl+/ comments and syntax-highlight classes, live + persisted settings (theme, font size, tab size, wrap, line numbers), Ctrl+S / Ctrl+P / Alt+Arrow, and a **50,000-line file** (edit and tab switch < 1.5 s, survives reload).

### Meta

- Version 1.3.0 (`KC.version`, SW cache `kingcode-v1.3.0`, `package.json`); `js/commands.js` and `js/palette.js` added to the precache list.

## [1.2.0] — 2026-11-03

Phase 3, step 4 (virtual filesystem, A-03) + start of Phases 4–5 (explorer, accessibility).

### Added

- **Folders.** File names are virtual paths (`src/lib/app.js`). `STATE` gained `addFolder / renameFolder / removeFolder / folderPaths / filesInFolder`; `addFile`/`renameFile` accept paths (a rename can move a file between folders). Empty folders are stored explicitly (`folders` in the persisted state); non-empty folders are derived from file paths. File/folder clashes (a file named like a folder or used as an ancestor) are rejected for user actions and auto-resolved for imports/legacy data (`U.resolveName`: exact duplicates get `-2`, `-3`…, clashes flatten `a/b.js` → `a-b.js`). Paths are sanitized per segment (`U.safePath`: no `.`/`..`/empty segments, depth ≤ 8, length ≤ 200), so a path can never escape the project.
- **Explorer tree** (`js/list.js`): folders first then files, collapsible (state persisted), folder actions (new file here, sub-folder, rename/move, delete with contents count), **filter box** (ancestors auto-expanded, Esc clears), WAI-ARIA tree keyboard model (↑/↓/Home/End, Enter/Space, ←/→ by text direction), actions float over the row on hover/focus/active instead of truncating names. New commands: «مجلد جديد» (palette + sidebar button).
- **Preview resolves paths**: relative (`css/a.css`), parent (`../shared/b.js`) and project-root (`/x.js`) references from an HTML file inside a folder; external/`data:`/`//cdn` URLs are never replaced; basename fallback keeps old flat projects working.
- Tabs show the file name (full path in the tooltip; `dir/name` only when two open tabs share a name).

### Fixed (accessibility — F-11, F-12)

- Every button now has an accessible name (toolbar, sidebar, burger and mobile quick bar, file/folder actions); `#cmd-input` and `#prompt-input` are labelled; the file list is a real `tree` (`treeitem`, `aria-level`, `aria-expanded`, `aria-selected`); palette results are `role=option` with `aria-selected`.
- **Keyboard trap removed**: `Tab` in the editor indents (a multi-line selection is indented as a block, `Shift+Tab` outdents) and **`Esc` leaves the editor** so the next `Tab` moves on (WCAG 2.1.2).
- Command palette showed at most 14 results (with > 14 files the commands were unreachable); now 60, scrollable.
- `KC.extOf/langFor` ignore dots in folder names (`dir.v2/readme` has no extension).
- Downloading a nested file uses its base name.

### Tests

- Unit: 30 core (+9: paths, folder CRUD, clash rules, move, persistence of empty folders, hydrate clash repair) + 11 preview (+3: nested/relative/absolute/external resolution). E2E: **36** (+10: tree rows/levels/collapse persisted, new-folder button + persistence + clash message, rename/delete folder flows, filter, nested preview run, export→import round trip of paths, tree keyboard model, accessible names/roles, Tab/Esc editor behavior, full palette).

### Meta

- Version 1.2.0 (`KC.version`, SW cache `kingcode-v1.2.0`, `package.json`).

## [1.1.0] — 2026-11-03

Phase 3, step 3 of `docs/audit/ARCHITECTURE_AUDIT.md` §4: asynchronous storage layer (A-01).

### Changed

- **Storage moved from one `localStorage` blob to IndexedDB** (`js/storage.js`, global `STORE`): one record per file + a `meta` record, **differential writes** (only the files that changed are written — editing one file writes one record), capacity in the hundreds of MB/GB instead of ~5 MB. `localStorage` remains as an automatic fallback when IndexedDB is unavailable (some private modes), with the same API.
- **Automatic migration:** on first run with IndexedDB the legacy `kingcode:state:v1` blob is read, shown and written into IndexedDB (the legacy key is left untouched as a backup).
- **Writes are asynchronous and serialized** (`STATE.persist(ids)` collects changed ids; `STATE.flush()` now returns a Promise; a failed write stays pending and is retried by the next write). The failure indicator, repeated warning and recovery from 1.0.7 are unchanged.
- **Leaving the page:** IndexedDB transactions cannot be awaited at `pagehide`, so `STATE.flushSync()` writes a small synchronous **crash journal** to `localStorage` (only the changed files) and `STORE.load()` applies it on the next boot if it is newer than the last save. (Verified: the fast-reload E2E test F-03 passes on IndexedDB.)
- Import backup (`importBackup`) is stored in IndexedDB too, so large projects can be backed up before import; the sidebar size now reports the project's content size instead of `localStorage` usage.
- `boot()` is asynchronous (`await STORE.init(); await STORE.load()`); `U.storage` and `KC.storageKey` were removed (dead code).

### Tests

- Unit: 21 core tests (+6 for `STORE`: load/legacy/corrupt/journal/backup, serialized writes, retry after failure). E2E: **26** (+6: IndexedDB backend & per-file records, 16 MB project beyond the old ceiling, differential save writes exactly one record, legacy migration, crash-journal recovery, localStorage fallback); F-02/F-05 tests now inject real IndexedDB failures and read persisted data from IndexedDB.

### Meta

- Version 1.1.0 (`KC.version`, SW cache `kingcode-v1.1.0`, `package.json`); `js/storage.js` added to the precache list.

## [1.0.9] — 2026-11-03

Phase 3 (architecture), steps 1–2 of `docs/audit/ARCHITECTURE_AUDIT.md` §4: one write path for project files and a pure, testable preview builder. Findings: A-02, A-05, T-01.

### Fixed

- **F-14 — after import or backup restore the editor kept showing the OLD document (data corruption risk).** `_applyImported` set `activeId` itself and then called `setActive`, which returns early for an unchanged id, so the editor, status bar and tabs never switched; the next keystroke wrote the old document's text into the newly imported file. `STATE.replaceProject` + an explicit `active:change` now open the new project. Regression test `A-02` in `tools/e2e.js` (verified red on the previous code, green now).
- Tab limit (`tabsMax`) is now enforced when creating files and never evicts the active tab (F-12).
- Preview fallback documents: a lone `.js` file is now actually executed (it was rendered as page text), `</style>` / `</script>` inside such files can no longer break out of the wrapper, and `index.html` is preferred over other HTML files when the active file is not HTML.

### Changed

- **Single write path (A-02):** `STATE.addFile / renameFile / removeFile / replaceProject / uniqueName` own every invariant (valid and unique names, `maxFiles`, tab and active-file consistency). `FILES` (js/files.js) is now only the UI layer (prompts, toasts, rendering) and no longer mutates `STATE.data.files` directly.
- **Pure preview builder (A-05):** document building moved from `js/preview.js` to `js/preview-builder.js` (`PreviewBuilder.build(files, activeId, opts)`): no DOM, no globals except `KC`/`U`; `PREVIEW` keeps the iframe, handshake and console.

### Tests

- New zero-dependency unit suites (`node:test`): `tools/unit/core.test.js` (15) and `tools/unit/preview.test.js` (8) — sanitizing, write path, persistence failure/flush/auto-save snapshot, hydrate, preview building and breakout cases. `npm test` now runs smoke + unit; CI syntax gate covers `tools/unit/`.
- `tools/e2e.js`: +1 test (A-02) → 20.

### Meta

- Version 1.0.9 (`KC.version`, SW cache `kingcode-v1.0.9`, `package.json`); `js/preview-builder.js` added to the precache list.

## [1.0.8] — 2026-11-03

Phase 2 of the audit remediation (security hardening). Findings: S-02, S-03, S-06 in `docs/audit/SECURITY_AUDIT.md`.

### Security

- **S-03 — shell CSP no longer allows `'unsafe-inline'` scripts.** The 8 inline `onclick` handlers were replaced by `data-action` attributes handled by one delegated listener in `js/ui.js`; the `window.files/ui/preview/tabs/editor/state` aliases that existed only for those handlers were removed (`window.kc` stays for tests). CSP also gained `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` and `frame-src 'self'`.
- **S-03 — preview now runs in its own page.** The preview iframe loads `sandbox.html` (opaque origin, still `sandbox="allow-scripts allow-modals"`) with its own CSP (`default-src 'none'`, inline script/style only, data:/blob: images) and receives the generated document by `postMessage` after a nonce handshake. Previously the `srcdoc` preview inherited the shell policy, which forced the shell to keep `'unsafe-inline'`. Preview network policy is unchanged: no fetch/XHR/WebSocket/remote resources.
- **S-02 — console bridge hardened.** `level` is allow-listed (`log/info/warn/error/debug`), at most 20 parts per message and 2,000 chars per part; forged or oversized messages cannot inject class names or markup.
- **S-06 — `referrer: no-referrer`** (meta + iframe attribute); host header guidance in `docs/security/HOSTING_HEADERS.md`.

### Tests

- `tools/e2e.js`: +4 tests (shell blocks inline script, preview scripts still run offline, bridge caps, sandbox page policy). `tools/ci-smoke.js`: +3 static guards.

### Changed

- Version 1.0.8 (`KC.version`, SW cache `kingcode-v1.0.8`, `package.json`); `sandbox.html` added to the precache list.

## [1.0.7] — 2026-11-03

Phase 1 of the audit remediation (data integrity). Each item maps to `docs/audit/REPOSITORY_AUDIT.md`; each has an E2E regression test in `tools/e2e.js`.

### Fixed

- **F-01 — silent loss of files beyond 60 on import/restore.** `U.sanitizeFiles` now enforces `KC.limits.maxFiles`, and the import/restore confirm dialog states exactly how many files will be dropped; `STATE.hydrate` no longer truncates silently.
- **F-04 — import validation.** Arrays and non-objects are rejected; duplicate names after sanitizing are renamed (`name-2.ext`); `.`/`..`/empty names and files over `KC.limits.maxFileChars` (2,000,000) are dropped; non-text content becomes empty — all reported to the user before confirmation.
- **F-02 — false "Saved" when storage fails.** Writes report success/failure (`'persisted' {ok}`); failure shows a persistent red status-bar state and repeats the warning (at most every 10 s); the "saved" flash only follows a successful write; manual save reports failure.
- **F-03 — edits lost on quick reload/navigation.** Pending save is flushed on `pagehide` and `visibilitychange:hidden`.
- **F-05 — auto-save off now really holds edits back.** While off, persistence writes the last saved content of a dirty file; Ctrl+S commits; re-enabling auto-save commits pending edits.
- **F-06 — service worker only deletes its own old caches** (`kingcode-cache-*`), never other apps' caches on the same origin.
- **F-07 — no automatic reload on update.** Removed unconditional `skipWaiting`; the page shows "update ready" and the new command `app.applyUpdate` (palette) flushes, activates and reloads on request. Removed the "checking for updates" toast at every startup (kept for the manual command).
- **F-08 — standalone HTML export no longer contains the console bridge.**

### Added

- `tools/e2e.js` / `npm run test:e2e`: 15 Chromium (Playwright) tests — core workflows, one regression test per fixed finding, and sandbox/XSS security guards. Playwright is a **devDependency only** (never shipped); CI job added.

### Changed

- Version aligned to 1.0.7 (`KC.version`, SW cache `kingcode-v1.0.7`, `package.json`).

## [1.0.6] — 2026-11-02

### Fixed

- **الاستيراد يستبدل المشروع كاملًا دون أي تأكيد (بند 1.6 — آخر بند حرج مفتوح من المرحلة الأولى)** — `FILES.importProject` يُنقّي الملف المختار بالكامل قبل لمس الحالة (`U.sanitizeFiles` أولًا)، ثم يحفظ **نسخة احتياطية** بالمشروع الحالي في `localStorage` تحت مفتاح مستقل `kingcode:import-backup:v1`، ثم يعرض **مودال تأكيد** يبيّن عدد الملفات المُستبدَلة وحالة النسخة الاحتياطية (وبها رسالة صريحة إن تعذّر حفظها لامتلاء المخزن) — لا استبدال إلا بنقرة مستخدم صريحة.

### Added

- **استعادة نسخة ما قبل الاستيراد** — أمر جديد في لوحة الأوامر (`files.restoreBackup`، مجموعة «ملفات») يعيد المشروع السابق من النسخة الاحتياطية بعد تأكيد، برسائل صريحة عند غيابها أو تلفها — وُضع كأمر ظاهر بدل مسار خفي ليكون قابلًا للاختبار والاكتشاف.
- **package.json (صفر تبعيات)** — يفتح `npm run dev` كمدخل رسمي مكافئ لـ `node tools/server.js`، مع حقول `license: MIT` و`engines: node>=18` و`repository`. لا يجلب أي حزمة — القاعدة «صفر اعتماديات» في plan.md محفوظة حرفيًا.
- **CI + مجموعة فحص صفر-تبعيات (`tools/ci-smoke.js` → `npm test`)** — 16 حارسًا آليًا ضد انحدارات الموثقة في `docs/audit/`: انهيار السيرفر (CB-02)، عبور الجذر وتوراكل الوجود (CB-04)، CORS العام (SC-08)، MIME (SC-09)، وجود CSP وساندبوكس ضيق (SC-04)، واتساق الإصدارات `config ↔ SW ↔ CHANGELOG` (CB-08 بوصفه حارسًا دائمًا). تشغيل محلي مؤكد: **16/16 PASS (2026-11-02)** + بوابة صياغة `node --check` على 12 ملفًا، وخطوة GitHub Actions (`.github/workflows/ci.yml`) لكل push وPR.
- **CONTRIBUTING + قوالب Issue** — قواعد ملزمة موثقة للمساهمين (صفر تبعيات، قاعدة رفعة كاش SW، الدليل الحي الإجباري: أمر + خرج، حد 400 سطر وهدف معماري واحد لكل PR) وقالبا `bug_report` و`feature_request` في `.github/ISSUE_TEMPLATE/`.

### Changed

- **نظافة المستودع** — نقل 14 لقطة اختبار إلى `docs/img/` ونقل `design-choices.html` إلى `docs/` (بلا أي مراجع كود)، وإغلاق CB-07 بوصفه إشارة قديمة (صفر مرجعيات كود عند HEAD — إغلاق YAGNI).
- **رفعة الإصدار v1.0.6** — `KC.version` وكاش SW `kingcode-v1.0.6` و`package.json` دفعة واحدة في نفس الكوميت (قاعدة CB-08 الملزمة: كل تغيير أصل يقدَّم للمستخدم يرفع الكاش بنفس الكوميت — تعديل اليوم يمس `js/files.js` و`js/ui.js`).
- **LICENSE (MIT)** — المستودع حصل على ملف الرخصة الرسمي المطابق لما يعلنه README، وأضاف README مدخل `npm run dev` وقسم «الجودة (CI)».

## [1.0.5] — 2026-11-02

**الملخص (TL;DR):** إغلاق تسرب إصلاح CB-01 (زر الكونسول كان ما يزال مسجَّلًا مرتين فتُلغي النقرةُ نفسها)، وتثبيت SW مقاومٌ للأصل الفائت، وتوحيد لون الثيم، وتفريدٌ صحيح لأسماء الملفات عند ثلاث سجلاتٍ فأكثر.

### Fixed

- **Console toggle double-wiring (CB-01 residue)** — removed the inline `onclick="ui.toggleConsole()"` from `#btnConsoleToggle` (`index.html:103`); the `js/ui.js` listener is the single wiring channel now. Live evidence before: one click fired `invocations: 2` → self-cancelling toggle.
- **Duplicate-name hydration collision** — `state.hydrate` appended a fixed `" (2)"` suffix, so a 3rd duplicate received the same name as the 2nd; a counter now climbs until the candidate is genuinely unused (`x (3).ext`, `x (4).ext`, …).
- **Dead code** — removed the no-op `setTimeout(() => this.input, 50)` in the command-palette open path (`js/ui.js`).

### Changed

- **SW install resilience** — per-asset `Promise.allSettled` replaces all-or-nothing `cache.addAll`; one missing asset now logs `[kingCode SW] precache incomplete — assets missing: …` and offline precache continues for the rest.
- **manifest `theme_color`** `#0098ff` → `#12253a` — unified with the app's dark chrome (`meta#metaTheme` default).
- **README** — refresh SW version claim (`kingcode-v1.0.5`, 54 assets).

### Meta

- Version alignment (CB-08 rule): cache `kingcode-v1.0.5` ≡ app `1.0.5`.

## [1.0.4] — 2026-11-02

**الملخص (TL;DR):** إصلاحات المرحلة الأولى المؤكدة حياً: انهيار الخادم، تسريب عبور الجذر، ربط الأزرار المزدوج، فشل تكرار الملف الثاني، ازدواج قاعدة CSS، تصحيح MIME وCORS، ومواءمة الإصدار مع ترقية كاش الخدمة إجبارياً بعد ثبوت تقديم نسخة متقادمة للملفات المصلحة.

### Fixed

- **Toolbar double-wiring (CB-01)** — commit `d76f74d`: removed inline `onclick` attributes from the 8 double-bound buttons (single wiring channel is the `js/ui.js:186-194` listeners). Live evidence before: one click fired handlers twice (`invocations: 2`), theme toggle self-cancelled; after: `invocations: 1` per click with correct dark/light round-trip.
- **Server crash on malformed URL (CB-02 / SC-01a)** — commit `558845d`: `decodeURIComponent` wrapped in try/catch → HTTP **400**; added NUL-byte guard. Live evidence before: `GET /%` → `URIError` + `Exited with code 1`; after: 400 and the next request still a **200**.
- **Server root-boundary escape (CB-04 / SC-01)** — commit `558845d`: paths resolved with `path.resolve(ROOT, '.' + urlPath)` and compared against ROOT **with trailing separator**. Live evidence before/after: `/..%2f..%2fREADME.md` → 200 → **403**; missing-outside path → 404 → **403** (no more existence oracle); sibling-prefix names (e.g. `kingcode-x`) no longer accepted.
- **MIME + wildcard CORS (CB-05 / CB-07 / SC-08 / SC-09)** — commit `5cea36c`: every `.json` is served as `application/json`; only `manifest.json` is special-cased to `application/manifest+json` (verified by header); `Access-Control-Allow-Origin: '*'` removed from all responses (verified via `curl -I`).
- **Second file duplicate silently failing (CB-03)** — commit `12087a4`: `duplicate()` routes the proposed name through `_uniqueName()`; copies become `index copy.html`, then `index copy-2.html`, … Live evidence: both duplicates returned file objects instead of the second returning `false`.
- **Duplicate `.file-name` CSS rules (CB-06)** — commit `7161f50`: single consolidated rule in `css/components.css`; the small-screen `@media (max-width: 767px) { max-width: 20vw }` override moved there because `components.css` loads after `main.css` and would have overridden it. Live computed styles: mono font, 11.5px, `max-width: 460.8px` (30vw @1536px) and `140px` (20vw @700px) on both `#statusFile` and file-list labels.

### Changed

- **Version alignment + mandatory SW cache bump (CB-08)** — commits `8d3f511`, `7fcd156`: `KC.version` and the Service Worker cache `VERSION` are now both `1.0.4` / `kingcode-v1.0.4`. Driving evidence: during browser verification a Playwright profile still executed **old** `js/config.js` (version `1.0.0`) and **old** `js/files.js` (pre-fix duplicate) because `service-worker.js` bytes had not changed since `1111bab`, so `registration.update()` reinstalled nothing and installed PWA clients would keep serving stale files indefinitely. The bump forces a fresh install; the activate handler deletes all prior `kingcode-cache-*` caches (verified: single cache `kingcode-cache-kingcode-v1.0.4` after reload, page reports `kingCode 1.0.4`).
  **Standing rule:** every asset change requires a SW cache version bump in the same commit.

### Style

- Stray UTF-8 BOM removed from the top of `index.html` (introduced in `1111bab`) — commit `99aaa71`; stray indent fixed in a `js/preview.js` comment — commit `bf185c5`.

## [1.0.3] — 2026-11-02

### Fixed
- Commit `1111bab`: Content-Security-Policy meta; tightened preview sandbox (`allow-scripts allow-modals` only); postMessage source validation before accepting console events; escaping of injected file names; `EDITOR.docs` cleanup on file delete (memory leak); RTL-aware Alt+Arrow tab cycling; storage-quota warning toast; SW update flow and cache bump to `kingcode-v1.0.3`.

## Older releases
- See git history and the audit reports in `docs/audit/`.
