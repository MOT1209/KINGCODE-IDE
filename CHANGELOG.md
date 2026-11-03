# Changelog

توضّح هذه الوثيقة كل تغيير مهم في المشروع. الترقيم دلالي (SemVer) والصيغة مستندة إلى Keep a Changelog.
This document records all notable changes to the project (semver, Keep a Changelog style).

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
