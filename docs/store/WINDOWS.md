# Windows (Microsoft Store) — MSIX from the PWA

_Plan and checklist. Nothing here has been built or run (no Windows machine, Partner Center account or signing certificate in this environment). Vendor facts are marked **verify**._

## 0. Prerequisites

- A **public HTTPS origin** (`README.md` → HOSTING), `npm run store:check` green, installable in Edge (DevTools → Application → Manifest shows no errors).
- A Microsoft Partner Center developer account (**verify** current registration requirements/fee).
- A Windows 10/11 machine to sideload-test the package.

## 1. Reserve the app name and get the package identity

In Partner Center: *Apps and games → New product → MSIX or PWA app → reserve the name*. Open *Product identity* and copy: **Package/Identity/Name**, **Package/Identity/Publisher** (`CN=…`), **Publisher display name**. PWABuilder asks for these (**verify** the exact field names in the current UI).

## 2. Build the MSIX

1. Open `https://www.pwabuilder.com`, enter `https://APP_ORIGIN`, review the manifest/service-worker report.
2. **Windows → Store package.** Enter the identity values from step 1, version (`x.y.z.0` form), and generate. Download the package (it includes a sideloading option and a signing-key option for local tests — **verify**).
3. Store submission uses the Store-signed package; the test certificate is only for sideloading. Keep any generated keys backed up.

## 3. Test before submitting (owner, on Windows)

| Check | Notes |
|---|---|
| Sideload/install the package (enable developer mode / install the test cert as instructed by PWABuilder) | **verify** current steps |
| Launches in its own window; icon, name, splash look right (maskable/any icons exist) | `store:check` verifies the files, not their look on Windows |
| Create/edit/close/reopen → data persists | WebView2 profile storage per app — verify what uninstall does to data |
| Offline start; update flow ("update ready" toast → apply) | Service worker in the packaged host |
| Export/import files via the native file dialogs; keyboard shortcuts (Ctrl+S, Ctrl+P, Ctrl+Enter…) | `Ctrl+P` is intercepted for the command palette; confirm it does not open a print dialog |
| Narrow/snapped window and high-DPI scaling | Responsive layout |
| Arabic/RTL rendering | Fonts and IME |

## 4. Submission checklist (draft text in `LISTING.md`)

- Category (Developer tools), **privacy policy URL = `https://APP_ORIGIN/privacy.html`**, age rating questionnaire (**you** answer it), pricing (free) and markets.
- Description (AR/EN), keywords, screenshots: provided `screenshots/wide-1.png`, `wide-2.png` (1280×720). **Verify** the Store's current minimum/recommended screenshot size; if it wants larger images, regenerate with `tools/make-screenshots.js` after changing the viewport.
- Certification notes: "Offline-capable local code editor. No account is required. Network is not used by the app."

## 5. Known gaps

- No real terminal, Git or file-system access to real folders — those need the Tauri path (`MULTI_PLATFORM_STRATEGY.md`), not the PWA/MSIX route.
- Behaviour inside the packaged host (WebView2/Edge) is expected to match Edge but is **unverified**.
