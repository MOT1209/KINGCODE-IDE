# Multi-platform strategy — Android and Windows

_Status: **plan only**. Nothing in this document is implemented. It describes how the code that exists today (v1.4.x: a zero-runtime-dependency PWA) can reach Google Play and the Microsoft Store with the least rewriting, and what must be built first. Facts about the current code are marked **(verified)**; everything about third-party platforms, store policies and tool versions is **my assessment as of this writing and must be re-checked against the vendor documentation before committing** — I could not verify store policies or toolchain versions from this environment._

## 1. What we have and what it implies

| Fact **(verified in this repo)** | Implication |
|---|---|
| The product is a static web app: `index.html`, `sandbox.html`, vanilla JS in global scripts, CodeMirror 5 vendored, service worker, manifest with maskable icons and shortcuts. | Any WebView/Chromium shell can host it unchanged. A rewrite to React Native/Expo would discard the editor, preview, tests and 4 phases of hardening. |
| All persistence goes through one interface, `STORE` (`js/storage.js`: IndexedDB with localStorage fallback, per-file records, crash journal, migration). | The seam for native file system, cloud sync and Git already exists. |
| All project mutations go through `STATE` (`addFile/renameFile/removeFile/addFolder/renameFolder/removeFolder/replaceProject`); project files are virtual paths. | A native folder or a Git working tree can be mirrored through the same API. |
| Document building is a pure function (`PreviewBuilder.build`). Preview runs in an opaque-origin sandboxed page with its own CSP and a nonce handshake. | The preview security model carries over to any WebView that supports `sandbox` iframes. |
| Commands are a registry (`Commands.add`); UI is event-driven. | Native menus/shortcuts and a future extension API can attach here. |
| There is **no** terminal, Git, AI, authentication, cloud or extension system. Preview cannot reach the network by design. | These are new subsystems, not ports. They are the real work of the platform roadmap. |

## 2. Options evaluated

### Android

| Option | Reuses today's code | Effort | Native file access | Play Store | Main risks |
|---|---|---|---|---|---|
| **A. PWA → Trusted Web Activity (TWA)** (Bubblewrap/PWABuilder) | 100% | Lowest | Browser File System Access API is limited on Android Chrome; use the Storage Access Framework only via a native layer | Possible; requires a Digital Asset Links file on the HTTPS origin and meeting current Play requirements for the target API level | Depends on the user's Chrome; no native plugins; offline works via the service worker |
| **B. Capacitor** (WebView shell + plugins) | ~100% (static assets bundled in the APK) | Low–medium | Filesystem and Share plugins; SAF folder picking via a community plugin or a small custom plugin | Standard | A bundled WebView means we must verify service-worker/IndexedDB behaviour in the Android WebView; one more dependency set to maintain |
| **C. React Native / Expo** | ~0% of UI and editor (CodeMirror needs a WebView anyway) | Highest | Full | Standard | A rewrite that ends up embedding the same web editor in a WebView; two codebases |
| **D. Native Kotlin + WebView** | ~100% inside the WebView | Medium | Full (SAF, Intents) | Standard | Highest maintenance of the three viable shells for a one-person project |

**Recommendation (Android): B, Capacitor, with A as the zero-cost first milestone.** Ship the TWA to validate demand, store listing and install flow with no new code; move to Capacitor when native file access (open a real folder, share targets, background sync) becomes a requirement. Do **not** choose C: Expo/React Native does not contain a code editor, so the editor would be a WebView with a bridge — the web app we already have, plus a rewrite of everything around it.

### Windows

| Option | Reuses today's code | Bundle/memory | Native access | Store packaging | Main risks |
|---|---|---|---|---|---|
| **A. PWA installed from Edge / PWABuilder → MSIX** | 100% | Smallest | Browser APIs + File System Access API (Chromium supports it on desktop) | MSIX via PWABuilder to the Microsoft Store | Limited to what Edge's PWA host exposes; no child processes |
| **B. Tauri (Rust + WebView2)** | ~100% of the web assets | Small | Rust commands: file system, **pty/process spawning for a real terminal**, Git via `libgit2`/`git` | MSIX/installer; Store submission supported by the ecosystem | Adds a Rust toolchain; WebView2 runtime dependency (preinstalled on current Windows 11) |
| **C. Electron** | ~100% | Large (bundles Chromium) | Full Node APIs: `node-pty`, `child_process`, `simple-git` | MSIX/installer | Size and memory; security surface of Node in the renderer must be locked down (context isolation, no `nodeIntegration`) |
| **D. WinUI/WPF + WebView2** | ~100% inside WebView2 | Small | Full .NET | Native Store path | Windows-only codebase to maintain |

**Recommendation (Windows): A first, then B (Tauri).** PWABuilder/MSIX gets a Store listing without new code. When the roadmap needs a **real terminal and Git**, move to Tauri: those two features require OS processes, which no PWA or sandbox can provide, and Tauri gives them with a much smaller footprint and tighter default security than Electron. Choose Electron only if a Node-only dependency becomes essential. If one shell must cover both platforms' desktop and mobile later, Tauri 2 also targets Android/iOS, but it is younger than Capacitor on mobile — **re-evaluate at decision time**.

## 3. Shared architecture (what to build once)

```
┌──────────────────────────── Web core (this repo) ────────────────────────────┐
│ UI + CodeMirror · Commands · STATE (project model) · PreviewBuilder · sandbox │
├───────────────┬──────────────────────┬──────────────────┬────────────────────┤
│ STORE adapter │ FS adapter (new)     │ Git adapter (new)│ AI adapter (new)   │
│ idb | local   │ virtual | native dir │ none | isomorphic│ none | provider API │
├───────────────┴──────────────────────┴──────────────────┴────────────────────┤
│ Platform shell: Browser/PWA · TWA/Capacitor (Android) · MSIX/Tauri (Windows)  │
└────────────────────────────────────────────────────────────────────────────────┘
```

| Concern | Strategy |
|---|---|
| **File system abstraction** | Introduce an `FS` interface (`list/read/write/rename/delete/watch`) with the current virtual project as the default implementation and `STATE`/`STORE` unchanged for callers. Native shells implement it against a real folder (Capacitor Filesystem + SAF on Android; Tauri commands on Windows; the File System Access API on Chromium desktop). The project model already uses `/` paths, so the mapping is direct. |
| **Editor** | Keep CodeMirror 5 for now (works in every WebView, vendored). CM5 is in maintenance mode: migrating to CodeMirror 6 is a separate, test-guarded task that should happen **before** adding LSP-style features, not as part of packaging. |
| **Terminal** | None exists. Web/PWA/TWA: **no real shell is possible**; offer a clearly labelled *task runner* only if it is honest about being a sandbox (e.g. run JS in the preview sandbox). Windows/Tauri: spawn a real PTY from Rust (`portable-pty`) and render with xterm.js; the command goes through an allow-listed bridge, never `eval`. Android: no general shell; remote dev containers are the realistic route. Never present the preview console as a shell (existing rule). |
| **Git** | None exists. Pure-JS Git (`isomorphic-git`) over the `FS` adapter works in every shell, including the browser, with CORS-proxy caveats for HTTPS remotes. Native shells may call the system `git` for performance. Credentials: OS keychain via the shell (Tauri keyring, Android Keystore/EncryptedSharedPreferences) — **never** `localStorage`/IndexedDB in plaintext. |
| **AI orchestration** | New subsystem, not a port. Requirements before building: (1) a thin **backend/proxy** so provider keys never ship in client code (the current app has no secrets and must stay that way); (2) a tool-call layer that exposes only `Commands`/`STATE` operations with explicit user approval for writes; (3) rate/usage limits and an offline-first behaviour (AI features disabled, editor unaffected). Agents that edit files must go through the same `STATE` write path (and therefore the same validation and undo story). |
| **Authentication** | Not needed for the local editor. Needed only for cloud sync/AI: OAuth 2.0 with PKCE in the system browser (custom tabs on Android, loopback/redirect on Windows), tokens in the OS secure store. Do not build an in-app password form. |
| **Cloud sync** | Build on per-file records and `savedAt` already in `STORE`: last-writer-wins per file with conflict copies (`name (conflict).ext`), content hashes to skip unchanged files, end-to-end encryption optional. Needs a backend; out of scope until auth exists. |
| **Extensions / marketplace** | Start with a **declarative** extension format (themes, snippets, templates, commands calling `Commands`) loaded into a sandbox like the preview (opaque origin, message API). Defer arbitrary-code plugins and MCP servers until the permission model (per-extension capabilities, user consent, signing) is designed; plugins are the largest security risk on the roadmap. |
| **Platform integrations** | Share/“open with” intents (Android), file associations and jump lists (Windows), notifications, window state. All behind a `Platform` object so the web core stays free of shell-specific code. |

## 4. Distribution requirements (verify before relying on any of this)

**Google Play:** a developer account, a signed Android App Bundle, a privacy policy URL, a data-safety declaration, store listing assets, and compliance with the target-API-level rule in force at submission time. A TWA additionally needs `assetlinks.json` served from the app's origin. *(Check the current Play Console policies and API-level deadlines.)*

**Microsoft Store:** a developer account, an MSIX package (PWABuilder or the Tauri/Electron toolchain), identity/publisher values from Partner Center, privacy policy and age rating, and Store-compliant icons and screenshots. *(Check current certification policies; sideloaded installers do not need the Store.)*

**Both:** an HTTPS origin or bundled assets; a privacy policy that states the truth (today: no data leaves the device); a real update strategy (the service worker's explicit "apply update" flow from 1.0.7 already avoids interrupting editing); and crash/diagnostic reporting only with consent.

## 5. Phased plan (each step independently shippable)

| Phase | Deliverable | Prerequisites in this repo | Exit criteria |
|---|---|---|---|
| P0 *(done)* | Hardened PWA, tests, CI | — | 47 E2E, 43 unit, lint, CI green |
| P1 | Stable public origin on a host that can send headers (see `docs/security/HOSTING_HEADERS.md`); `assetlinks.json` | none | Lighthouse PWA installable, headers verified |
| P2 | **Android TWA** (Bubblewrap/PWABuilder) to a Play internal-testing track | P1 | Installs, offline works, update flow works on a device (**needs real devices/emulators — not testable here**) |
| P3 | **Windows MSIX** from the PWA to the Store | P1 | Passes Store certification checks (**needs a Windows machine — not testable here**) |
| P4 | `FS` adapter interface + File System Access API implementation on Chromium desktop | `STORE`/`STATE` seams (exist) | Open/save a real folder in Edge/Chrome with the same E2E suite |
| P5 | Capacitor shell (Android) with native folder access; Tauri shell (Windows) with the same `FS` implementation | P4 | Same E2E workflows pass inside each shell |
| P6 | Git (isomorphic-git over `FS`), then Windows PTY terminal (Tauri only) | P5 | Clone/commit/push against a test remote; terminal behind an allow-list |
| P7 | Auth + backend + AI proxy; cloud sync | P6, threat model | Keys never in the client; security review |
| P8 | Declarative extensions, then a marketplace | P7 | Sandboxed extensions with explicit permissions |

## 6. How the existing implementation evolves without rewriting

1. **Keep the web core.** Every shell above embeds `index.html` as-is; the only new code per platform is a thin adapter.
2. **Grow behind interfaces that already exist:** `STORE` (persistence), `STATE` (project model), `Commands` (actions), `PreviewBuilder` (rendering). New capabilities attach to these rather than editing call sites.
3. **Keep one test suite for all shells.** The E2E suite drives the UI through `kc`/DOM; running it against each shell's WebView is the regression guard (Playwright covers Chromium/WebView2; Android WebView needs device or emulator automation — not available here).
4. **Defer the two big technology migrations** (ES modules/bundler and CodeMirror 6) until a shell actually needs them; each has its own decision record in `docs/architecture/DECISIONS.md`.
5. **Security first for new surfaces:** every new subsystem (terminal, Git, AI, extensions, sync) starts with a short threat model, keeps secrets out of the client, and inherits the "least privilege + explicit consent" rule used for the preview sandbox.

## 7. Open questions for the product owner

1. Is a Play/Store listing the goal, or are installable PWAs enough for now? (Decides whether P2/P3 come before P4.)
2. Is a **real terminal** a requirement for Android? (If yes, a remote dev-environment service is the only honest option; it changes the backend scope.)
3. Which AI provider(s) and who pays for usage? (Decides the proxy design and rate limits.)
4. Is offline-only (no account) a product principle, or is cloud sync a core feature?
