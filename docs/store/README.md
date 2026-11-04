# Publishing kingCode to Google Play and the Microsoft Store

_Status (v1.5.0): the **app is store-ready as a PWA**; nothing has been submitted, built into an APK/AAB/MSIX, signed, or tested on a device. This folder says exactly what is done, what only the owner can do, and how to do it._

> **Verification note.** Everything here about store policies, fees, tool versions and console wording is my assessment and **was not checked against the vendors' current documentation** (no access from this environment). Treat each such statement as "verify before relying on it". What *is* verified is marked "(checked by `npm run store:check`)".

## Tooling

`npm run package:validate` shows which owner inputs are missing; `npm run package:generate` produces the Bubblewrap/PWABuilder inputs from the manifest. See `packaging/README.md`.

## Strategy (decision record: `docs/architecture/DECISIONS.md` ADR-8)

Package the existing PWA instead of rewriting it:

| Platform | Route | What gets built | Needs |
|---|---|---|---|
| Android / Google Play | **Trusted Web Activity (TWA)** via PWABuilder or Bubblewrap | An Android App Bundle that opens the PWA full-screen in Chrome | Public HTTPS origin, Digital Asset Links file, signing key, Play developer account |
| Windows / Microsoft Store | **MSIX** via PWABuilder | An MSIX that hosts the PWA in Edge/WebView2 | Public HTTPS origin, Partner Center account (package identity values) |

Later (not now): Capacitor on Android and Tauri on Windows, when native folder access or a real terminal is needed (`docs/architecture/MULTI_PLATFORM_STRATEGY.md`).

## What is already done (in this repository)

| Item | Where | Verified |
|---|---|---|
| Installable PWA: manifest (`id`, `scope`, `standalone`, RTL, shortcuts), icons incl. maskable 192/512, offline service worker with an explicit "update ready" flow | `manifest.json`, `icons/`, `service-worker.js` | `npm run store:check` (declared vs actual PNG sizes) |
| Store screenshots (wide 1280×720, narrow 540×960 = 9:16) generated from the real app | `screenshots/`, `tools/make-screenshots.js`, declared in the manifest | `store:check` |
| Privacy policy page (Arabic + English), linked from Settings, precached | `privacy.html` | `store:check`; facts it states (no cookies, no network calls, no external URLs) are checked against the shipped code |
| Security headers for hosting (single `frame-ancestors 'self'` rule so the preview iframe keeps working) | `vercel.json`, `_headers`, `docs/security/HOSTING_HEADERS.md` | `store:check` (structure only — **never run on a real host**) |
| Listing copy (AR/EN, honest about what is *not* included) | `docs/store/LISTING.md` | reviewed by hand |
| Offline, update, storage, accessibility, responsive behaviour | `tools/e2e.js` (Chromium, Firefox, WebKit builds) | CI |

## What only the owner can do (I cannot)

1. **Choose and own the public origin** (a domain/URL you control). Android's asset-link verification and the Store listing are tied to it; changing it later is painful. See `HOSTING` below.
2. **Create the developer accounts** (Google Play Console, Microsoft Partner Center) — identity checks and fees apply (verify current).
3. **Generate and keep the signing keys.** Losing the Android upload/app-signing key can block updates. I will not generate or handle your keys.
4. **Test on real devices** — an Android phone and a Windows PC at minimum (checklists in `ANDROID.md` / `WINDOWS.md`). Chromium/Firefox/WebKit builds in CI are not the shipping browsers on those devices.
5. **Design assets I did not make:** Play feature graphic (1024×500) and any promotional art.
6. **Answer the console questionnaires** (data safety, content rating, target audience) — draft answers are in `LISTING.md`, but you are legally the one declaring them.

## Order of work

1. **Deploy the web app** to a stable HTTPS origin (HOSTING below). This is also useful on its own as a normal installable PWA.
2. Run `npm run store:check` against the repo and open the deployed URL in Chrome DevTools → Application → Manifest/Service Workers to confirm installability.
3. **Android:** follow `ANDROID.md` (PWABuilder is the fastest first build) → internal testing track → real-device checklist → production.
4. **Windows:** follow `WINDOWS.md` → sideload-test the MSIX → submit.
5. Re-run the checklists after every release; bump `KC.version` + the service-worker cache version (see `CONTRIBUTING.md`).

## HOSTING

Any static host works. Recommended: **a host that can send headers** (Vercel, Netlify, Cloudflare Pages) — GitHub Pages cannot set the security headers and shares its origin with every other `*.github.io` project (shared IndexedDB/localStorage, see `SECURITY.md`).

- **Vercel:** import the GitHub repository; framework "Other", no build command, output directory `.` (already in `vercel.json`). Attach your custom domain.
- **Netlify / Cloudflare Pages:** publish the repository root; `_headers` is picked up automatically.
- After deploying, verify with `curl -sI https://<origin>/ | grep -i -E "content-security|nosniff|referrer|strict-transport"` and `curl -sI https://<origin>/service-worker.js | grep -i cache-control`.
- **Check the preview still works on the real host** (open a project with a script and look at the console panel). The `frame-ancestors 'self'` rule is designed not to block `sandbox.html`, but it was only tested structurally, not on a live host.

I can deploy to Vercel for you if you want that and confirm the target account/project — a public deployment is an outward-facing action, so I will only do it on your explicit go-ahead.
