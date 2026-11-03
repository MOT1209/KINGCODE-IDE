# Recommended hosting headers (S-06)

`<meta>` tags cannot set `frame-ancestors`, `X-Frame-Options`, `Permissions-Policy` or HSTS. kingCode is a static site, so set these at the host. The app already ships a meta CSP and `referrer: no-referrer`.

Suggested response headers for every path:

```
Content-Security-Policy: frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Strict-Transport-Security: max-age=31536000; includeSubDomains   (HTTPS hosts only)
```

Notes
- Do not add a header CSP stricter than the meta CSPs for `sandbox.html`: it must keep allowing inline scripts/styles (user code runs there). A header CSP and a meta CSP are both enforced, so keep the header to `frame-ancestors` only.
- `sandbox.html` must stay embeddable by the app itself, so use `frame-ancestors 'self'` for that path if you split rules.
- Netlify / Cloudflare Pages: put the lines in a `_headers` file. Vercel: `vercel.json` `headers`. GitHub Pages cannot set custom headers, so clickjacking protection is unavailable there; prefer a host that can.
- Shared origins (`user.github.io`) share `localStorage` with every other app on that origin (S-07): use a custom domain for sensitive projects.
