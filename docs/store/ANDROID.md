# Android (Google Play) — Trusted Web Activity

_Plan and checklist. Nothing here has been built or run (no Android SDK/JDK, accounts, signing keys or devices in this environment). Vendor facts are marked **verify**._

## 0. Prerequisites

- A **public HTTPS origin** serving the app (see `README.md` → HOSTING). Call it `https://APP_ORIGIN`.
- `https://APP_ORIGIN/manifest.json`, the icons and `service-worker.js` reachable; `npm run store:check` green.
- Google Play Console developer account (**verify** current registration requirements/fee and any testing requirements for new personal accounts).
- A signing setup. **Recommended: Play App Signing** (Google holds the app-signing key; you keep an upload key).

## 1. Build the package

### Option A — PWABuilder (fastest, no local toolchain)
1. Open `https://www.pwabuilder.com`, enter `https://APP_ORIGIN`, let it analyse the manifest/service worker.
2. Choose **Android → Google Play** package. Set the package id (e.g. `app.kingcode.ide` — pick yours; it is permanent), app name, version, and let it generate/accept a signing key. **Download and back up the key and its password.**
3. The download contains the app bundle (`.aab`) and a `assetlinks.json` fragment.

### Option B — Bubblewrap CLI (more control)
```bash
npm i -g @bubblewrap/cli                      # verify current install instructions
bubblewrap init --manifest=https://APP_ORIGIN/manifest.json
bubblewrap build                              # produces an .aab (needs JDK + Android SDK; Bubblewrap can help install them)
```

## 2. Digital Asset Links (removes the browser address bar)

Serve this at **`https://APP_ORIGIN/.well-known/assetlinks.json`** (content-type `application/json`; `vercel.json`/`_headers` already set it):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "YOUR.PACKAGE.ID",
    "sha256_cert_fingerprints": ["AA:BB:...:FF"]
  }
}]
```

- The fingerprint must be the **SHA-256 of the key that signs what users install**. With Play App Signing that is **Google's app-signing certificate** (Play Console → App integrity → App signing), not only your upload key; include both fingerprints while testing (**verify** in the current console).
- **Do not commit a placeholder file.** `npm run store:check` fails if `.well-known/assetlinks.json` contains placeholder text. Add the real file only when you have the real fingerprint, then redeploy.
- If verification fails the TWA falls back to a Chrome Custom Tab with a visible address bar — usually a fingerprint/package-name mismatch.

## 3. Play Console checklist (draft answers in `LISTING.md`; **you** are the declarant)

- App category (Tools or Productivity), contact email, **privacy policy URL = `https://APP_ORIGIN/privacy.html`**.
- **Data safety** form: the app collects and shares no user data (consistent with `privacy.html`; the hosting provider's ordinary server logs are not collected by the app — answer according to the form's current wording).
- **Content rating** questionnaire; **target audience** (a developer tool; not designed for children).
- Store listing: short/full description (`LISTING.md`), 512×512 icon (`icons/icon-512.png`), phone screenshots (`screenshots/narrow-1.png`, `narrow-2.png`, 540×960 — **verify** current size/aspect rules), **feature graphic 1024×500 (not provided — needs design)**.
- Upload the `.aab` to an **Internal testing** track first; add testers; install from the Play link.
- Meet the target API level required at submission time (**verify** — it changes yearly; Bubblewrap/PWABuilder normally target a current level).

## 4. Real-device test checklist (owner — not covered by any automation here)

| Check | Why it matters |
|---|---|
| Launches full-screen with **no address bar** | Asset-links verification worked |
| Create project, edit, close app, reopen → data still there | IndexedDB persistence inside the TWA (it shares Chrome's storage for the origin — **verify** what "clear app data"/uninstall does) |
| Airplane mode: cold start works offline | Service worker + precache |
| Export JSON/HTML, import a file from the phone's storage | `<a download>` Blob downloads and `<input type=file>` inside a TWA — **likely fine in Chrome but unverified** |
| Preview runs scripts; a thrown error shows in the console panel | `sandbox.html` handshake on Android Chrome |
| Rotate, split-screen, soft keyboard over the editor | Layout (E2E only emulates viewport sizes) |
| Back button behaviour | Android users expect it to close drawers/dialogs; the app currently handles `Esc`, not the system Back for the drawer — **may need work** |
| Update flow: ship v+1, open app → "update ready" toast → apply | Service-worker update path on device |
| Arabic text and RTL in editor, tabs, palette | Real fonts/IME |

Known gaps to expect: no Android system-Back handling for the file drawer/modals; no share-target/"open with"; hardware keyboard shortcuts only. Capacitor (see `MULTI_PLATFORM_STRATEGY.md`) is the path if these matter.
