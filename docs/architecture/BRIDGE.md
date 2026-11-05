# King Bridge — architecture, security model, status

## Why a local companion (ADR-9)
A browser PWA cannot open real folders on every platform, spawn a shell, run `git`, or launch agent CLIs. Tauri (Windows) and Capacitor (Android) shells are the long-term answer, but they need native toolchains (Rust + MSVC/WebView2, Android SDK) that cannot be built or tested in the CI/session environment, and Android cannot run a desktop shell at all. The Bridge keeps the existing web core untouched, is **testable today**, and its HTTP/NDJSON API is exactly the contract a Tauri sidecar or a remote dev-box would implement later.

* Zero runtime dependencies (Node ≥ 18). Start: `npm run bridge -- --origin https://your-app-origin [--workspace dir]`.
* Binds `127.0.0.1` only. Every endpoint except `/v1/health` requires `Authorization: Bearer <token>` (32-byte random, `~/.kingcode/token`, mode 0600, constant-time compare). `Host` must be loopback (DNS-rebinding), `Origin`, when present, must be on the allow-list (`--origin`, `KINGCODE_ORIGINS`). No wildcard CORS.
* Workspace operations resolve every path under the workspace root and reject absolute paths, `..`, NUL, and symlinks that escape. Deletes go to `.kingcode/trash` (undoable). Writes are atomic (temp + rename) with optional mtime conflict detection.
* Git/GitHub: `execFile` (no shell), `protocol.ext` disabled, hooks disabled, option-injection blocked by name/URL validation, `GIT_TERMINAL_PROMPT=0`. The bridge never stores Git credentials. GitHub token comes from the bridge environment only.
* Agents: permission profiles `read` / `edit` / `full`; `full` (shell + network) is refused unless the request carries `approved: true` (the UI asks first). Claude Code: `--allowedTools/--disallowedTools` (never `--dangerously-skip-permissions`). Child env strips bridge secrets. Concurrency cap, timeout, cancellation (SIGTERM→SIGKILL). Everything is audit-logged (`~/.kingcode/audit.log`).
* Secrets in MCP `env`/`headers` are masked when returned to the browser.

## Status of each area (verified = covered by an executed test in this repo)
| Area | Status | Notes |
|---|---|---|
| Workspace FS, undo, watch | IMPLEMENTED AND VERIFIED | `bridge/test` |
| Git local flow, clone | IMPLEMENTED AND VERIFIED | against real `git` 2.43 |
| GitHub PR/issues | IMPLEMENTED BUT NOT VERIFIED vs real GitHub | tested only against a mock API; OAuth login needs an owner-registered OAuth app → BLOCKED |
| Terminal (Linux PTY) | IMPLEMENTED AND VERIFIED | real PTY, resize checked with `stty size`. macOS: untested. **Windows ConPTY: NOT IMPLEMENTED** (pipe fallback only). UI renders text, not a full xterm emulator |
| Claude Code agent | IMPLEMENTED BUT NOT VERIFIED with a live model | tested against a fake CLI that emits stream-json; `claude --version` probed for real. Real runs need the user's login/API key |
| OpenCode agent | IMPLEMENTED BUT NOT VERIFIED | OpenCode is not installed here; flags (`run --model`) and `OPENCODE_PERMISSION` are from documentation, unverified |
| MCP registry + test | IMPLEMENTED AND VERIFIED | stdio handshake against a fake server, HTTP (SSE) against a mock |
| Skills | IMPLEMENTED AND VERIFIED | |
| Extensions | PARTIALLY IMPLEMENTED | registry/permissions/compat verified; sandbox host (`ext-sandbox.html`) has a browser E2E; only `ui.notify`, `commands.register`, `files.read`, `files.write` exist |
| Project templates | IMPLEMENTED AND VERIFIED (files only) | Node template executed; others are scaffolds, not built |
| Debugger | NOT IMPLEMENTED | |
| Cloud / accounts | NOT IMPLEMENTED | design: optional, end-to-end encrypted sync, off by default |
| Tauri / Capacitor shells | NOT IMPLEMENTED | blocked by toolchains; existing TWA/MSIX packaging scaffolding unchanged |
