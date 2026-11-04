# Store packaging (Android / Windows) — scaffolding

_Status: **tooling only**. This generates the build inputs for Bubblewrap/PWABuilder. It does **not** build an AAB/MSIX, sign anything, call the network or submit to a store. No package, signature or listing exists._

## Single source of truth

| Input | Where | Who |
|---|---|---|
| App name, colors, icons, start URL, shortcuts, screenshots | `manifest.json` | repo |
| Version (`x.y.z`; Android `versionCode = major*10000+minor*100+patch`, Windows `x.y.z.0`) | `package.json` | repo |
| Origin, package id, publisher identity, key alias/path, signing fingerprints | `packaging/config.json` | **owner** (all `null`/empty today — nothing is invented) |

Never put passwords, keystores, certificates or tokens in `config.json`; the validator rejects secret-looking keys. Keep keystores outside the repository.

## Commands

```bash
npm run package:list                          # known platforms
npm run package:validate                      # errors / warnings / which OWNER inputs are still missing
npm run package:generate -- android           # refuses until owner inputs are complete
npm run package:generate -- all --allow-incomplete   # marked drafts (<<OWNER:…>>) in packaging/out/ (git-ignored)
npm run package:generate -- android --install        # complete config only: also copies .well-known/assetlinks.json to the repo root
```

Outputs (`packaging/out/<platform>/`): Android → `twa-manifest.json` (+ `.well-known/assetlinks.json` when fingerprints are given); Windows → `pwabuilder-windows-options.json`. Field names come from my knowledge of Bubblewrap/PWABuilder and are **not verified against their current docs** — confirm with `bubblewrap init --manifest …` / PWABuilder before relying on them.

## What remains for the owner (in order)

1. Public HTTPS origin (set `origin`); deploy; `curl -I` the headers (`docs/security/HOSTING_HEADERS.md`).
2. Android: choose `packageId` (permanent), create the keystore **outside the repo**, build with Bubblewrap/PWABuilder from `twa-manifest.json`, then put the SHA-256 of the key that signs what users install (Play App Signing: Google's certificate) into `signingFingerprints`, `generate android --install`, redeploy so `/.well-known/assetlinks.json` is live. See `docs/store/ANDROID.md`.
3. Windows: reserve the name in Partner Center, copy Identity Name / Publisher / display name into `config.json`, generate, build with PWABuilder. See `docs/store/WINDOWS.md`.
4. Test on real devices; submit.

## Extending (new platform or packaging route)

Add one file in `tools/packaging/platforms/<id>.js` exporting `{ id, title, ownerInputs(ctx), validate(ctx), generate(ctx) → [{path, content}], installable[] }`. The registry (`tools/packaging/index.js`) discovers it; `package:*` commands, owner-input reporting, the secret-key guard and draft marking apply automatically. Add cases to `tools/unit/packaging.test.js`. Candidates from `docs/architecture/MULTI_PLATFORM_STRATEGY.md`: Capacitor (Android native shell), Tauri (Windows shell with PTY). Shared context lives in `tools/packaging/common.js`.

## Tests

`tools/unit/packaging.test.js` (part of `npm test`): committed config has no invented values/secrets, registry interface, version derivation, refusal on missing inputs, correct output for a complete *test* config, rejection of http origins / bad ids / bad fingerprints / `CN=`-less publishers / secret keys. These verify the generators, **not** that Bubblewrap/PWABuilder accept the output.
