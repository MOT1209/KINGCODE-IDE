# KINGCODE IDE — master engineering report (session of 2026-11-05)

Branch `ccr-1cb6ebca-3xr27o`. Statuses: IMPLEMENTED AND VERIFIED · IMPLEMENTED BUT NOT VERIFIED · PARTIALLY IMPLEMENTED · NOT IMPLEMENTED · BLOCKED. "Verified" = an executed test in this repository covers it; commands and results are in §7.

## 1. Repository audit (Phase 1, re-verified)
Vanilla-JS PWA (~3.3k LOC app code in 14 global scripts, CodeMirror 5 vendored, IndexedDB storage, sandboxed preview, service worker, store-packaging generators), 3 unit suites + 50 E2E, CI on 3 browsers. The earlier audits (`docs/audit/*`, `SECURITY_AUDIT.md`) were re-checked by running the existing suites at the start: static 19/19, unit 32+12+8, store:check 53/53, eslint clean, `npm audit` 0. Before this session the product had **no** terminal, Git, AI/agents, MCP, skills, extensions, real-folder access or project builder.

## 2. Initial problems
No backend capable of the requested features; PWA CSP forbade any network; CI installed with `npm install` (no lockfile use); known open items (public deployment unreachable, Firefox/WebKit not runnable locally, SHA-pinned actions missing).

## 3. Fixed problems
* CI now uses `npm ci` (lockfile enforced).
* Bug found by the new E2E in the new UI (async `currentTarget` → null, `null` rendered into the page, bidi-reversed paths) — fixed before commit.

## 4/5. Implemented features and architecture (ADR-9, ADR-10, `docs/architecture/BRIDGE.md`)
| Module | Status |
|---|---|
| King File System (workspace sandbox, atomic write, conflict detect, trash+undo, watch) | IMPLEMENTED AND VERIFIED |
| King Git (local flow, clone, merge, rebase, diff) | IMPLEMENTED AND VERIFIED (real git 2.43) |
| GitHub PRs/issues | IMPLEMENTED BUT NOT VERIFIED (mock API only); OAuth → BLOCKED (needs owner OAuth app) |
| King Terminal | IMPLEMENTED AND VERIFIED on Linux PTY; Windows ConPTY NOT IMPLEMENTED; macOS untested; UI is a text renderer, not xterm |
| Agents: Claude Code | IMPLEMENTED BUT NOT VERIFIED with a live model (fake CLI + real `--version` probe) |
| Agents: OpenCode (primary) | IMPLEMENTED BUT NOT VERIFIED (CLI not installed here; flags/env from docs) |
| Agent orchestration: profiles, approval gate, cancel, history, audit, skills+MCP injection | IMPLEMENTED AND VERIFIED (against fake CLIs). Autonomous plan→test→fix loop with verification reports: NOT IMPLEMENTED (delegated to the CLIs' own agent loops) |
| King AI Engine usage/cost | PARTIALLY IMPLEMENTED (captures `usage`/`total_cost_usd` when the CLI reports it; no per-provider budget/limits) |
| King MCP | IMPLEMENTED AND VERIFIED (stdio + HTTP handshake, tools list, allow-list, logs, secret masking) |
| King Skills | IMPLEMENTED AND VERIFIED |
| King Extensions | PARTIALLY IMPLEMENTED (registry, permissions, compat, sandbox host verified; no marketplace/signing/CPU watchdog; 4 permissions only) |
| Project Builder | IMPLEMENTED AND VERIFIED for file scaffolding (Node template executed); React/Vue/Next/Flutter/RN scaffolds are NOT built or run |
| Dev Hub UI (desktop + phone layouts, ARIA, RTL) | IMPLEMENTED AND VERIFIED on Chromium; Firefox/WebKit only in CI |
| King Editor: LSP, folding, diagnostics, formatting | NOT IMPLEMENTED (needs CodeMirror 6 migration, ADR-5) |
| King Debugger | NOT IMPLEMENTED |
| King Cloud | NOT IMPLEMENTED (design only: optional, off by default, end-to-end-encrypted sync) |
| Tauri / Windows MSIX build, Capacitor / Android build, store submission | BLOCKED (no WebKitGTK/MSVC/Android SDK here; no owner identity/keys; existing packaging generators unchanged and still unbuilt) |

## 6. Security improvements
Loopback-only bind, 256-bit bearer token (0600 file, constant-time compare), Host + Origin allow-list (DNS-rebinding/CSRF), no wildcard CORS, path/symlink sandbox, argument-injection and `ext::` clone protection, hooks disabled, child env scrubbing, approval gate for full agent access, secret masking, append-only audit log, CSP `connect-src` limited to loopback and enforced by `store:check`, extensions in an opaque-origin no-network iframe. Residual risks: the token is readable by any local process of the same user; "remember token" stores it in `localStorage` (opt-in); extension CPU abuse; a malicious page on an allowed origin could act with the token if XSS exists in the app.

## 7. Tests executed (this session, Node 22.23.4, Chromium 1243 via `KC_CHROMIUM_PATH`)
| Command | Result |
|---|---|
| `npm test` | static 19/19; bridge 27/27; unit 32+12+8 pass; store:check 55/55 |
| `npx eslint .` | clean |
| `npm audit` | 0 vulnerabilities |
| `npm run test:e2e` (Chromium) | **59/59** (51 existing + 8 HUB) |
| Firefox / WebKit E2E, Android, Windows, real devices | **not run** (browsers/toolchains unavailable) — CI will run Firefox/WebKit |

## 8. Build results
Web app: no build step; served and tested. No APK/AAB/MSIX/Tauri build was attempted (blocked, see above).

## 9–10. Git
Branch `ccr-1cb6ebca-3xr27o`; commits: bridge (`feat(bridge)…`), hub UI (`feat(hub)…`), docs/CI. PR: opened at the end of the session (link in the chat reply).

## 11. Remaining issues
Live-model verification of both agent CLIs; Windows/macOS terminal; CodeMirror 6 + LSP; debugger; cloud; real shells; Firefox/WebKit runs of the new E2E; public deployment still unverified; SHA-pinned actions.

## 12. External requirements (owner)
OpenCode/Claude Code installs + credentials on the dev machine; GitHub OAuth app (client id) for interactive login; Windows/Android toolchains, signing keys, Partner Center/Play identities; hosting domain.

## 13. Next priorities
1. Run both agents against live models and fix flag drift. 2. Tauri shell with the bridge as sidecar (Windows). 3. CodeMirror 6 + LSP via the bridge. 4. Debugger (Node inspector / DAP through the bridge). 5. Cloud sync design review.
