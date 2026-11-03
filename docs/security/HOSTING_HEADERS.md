# Recommended hosting headers (S-06)

`<meta>` tags cannot set `frame-ancestors`, `X-Frame-Options`, `Permissions-Policy` or HSTS. kingCode is a static site, so set these at the host. The app already ships a meta CSP and `referrer: no-referrer`. Ready-made configs: **`vercel.json`** (Vercel) and **`_headers`** (Netlify / Cloudflare Pages) — structure checked by `npm run store:check`, **not yet exercised on a live host**.

Headers sent for every path:

```
Content-Security-Policy: frame-ancestors 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Strict-Transport-Security: max-age=31536000; includeSubDomains   (HTTPS hosts only)
```

Per-path:

| Path | Header | Why |
|---|---|---|
| `/service-worker.js` | `Cache-Control: no-cache` | updates must be discovered promptly |
| `/manifest.json` | `Content-Type: application/manifest+json`, `Cache-Control: no-cache` | correct MIME; manifest changes picked up |
| `/.well-known/assetlinks.json` | `Content-Type: application/json` | Android Digital Asset Links (the file itself is added only with the real signing fingerprint) |

## Why `frame-ancestors 'self'` and not `'none'`

The preview is `sandbox.html` embedded **by the app itself** in an `<iframe sandbox>`. `'none'` would forbid that embedding and break the preview; `'self'` allows the app's own origin and still blocks every other site from framing kingCode (clickjacking). It is deliberately a **single global rule**: two rules that both set `frame-ancestors` on the same path (e.g. a global `'none'` plus a `sandbox.html` exception) can be sent as two CSP headers, and browsers enforce the intersection — which would block the preview in production. `store:check` fails if more than one rule sets a CSP header.

## Notes

- Do not add a header CSP stricter than the meta CSPs for `sandbox.html`: user code runs there and needs inline scripts/styles. A header CSP and a meta CSP are both enforced.
- **After the first real deployment**, open a project with a script and confirm the preview and its console work (the only end-to-end proof that the framing rule is right), and check the headers with `curl -sI`.
- GitHub Pages cannot set custom headers, so clickjacking protection is unavailable there; prefer a host that can.
- Shared origins (`user.github.io`) share `localStorage`/IndexedDB with every other app on that origin (S-07): use a custom domain.
