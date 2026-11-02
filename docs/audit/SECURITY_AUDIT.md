# SECURITY AUDIT — KINGCODE IDE

## Overview
This audit identifies security vulnerabilities, unsafe patterns, and attack surfaces in KINGCODE IDE v1.0.3. Severity ratings follow industry convention: Critical (exploitable remote code execution or data exfiltration), High (significant vulnerability requiring exploit chain), Medium (moderate impact, difficult to exploit), Low (information disclosure or minor issue).

## Critical Security Issues

### SC-01: Server-Side Request Forgery (SSRF) Potential
**Severity:** Critical  
**File:** `tools/server.js:46-50`  
**Description:** The static file server uses `path.normalize(urlPath)` then checks `filePath.startsWith(ROOT)` to prevent directory traversal. However:
- `decodeURIComponent(req.url)` is called without try/catch — a malformed URL crashes the entire server
- `path.normalize()` may not catch all escape sequences when combined with percent-encoding
- Path like `/../etc/passwd` or `%2e%2e%2f` could potentially bypass the startsWith check
- No MIME-type validation on served files beyond the MIME map

**Evidence:** Code analysis shows:
```javascript
const filePath = path.join(ROOT, path.normalize(urlPath));
if (!filePath.startsWith(ROOT)) {
  send(res, 403, 'Forbidden', 'text/plain');
  return;
}
```
The `startsWith` check is insufficient if `normalize()` does not fully resolve `..` sequences — and it lacks a trailing path-separator guard.

**Runtime Verification (2026-11-02, live `node tools/server.js`, port 8123, `curl --path-as-is` raw request line):**

| Request | Live result |
|---------|-------------|
| `GET /..%2f..%2fREADME.md` | **200** — served the repo README (in-root). The leading `..` segments were **silently dropped by `path.normalize()`** (Node strips leading `..` after a root anchor), remapping the path to `/README.md` inside ROOT |
| `GET /..%2f..%2fdefinitely-missing-xyz-987.md` | **404** (not 403) — proves the path was remapped, not rejected: the boundary check never fired |
| `GET /$`-class malformed URLs (`/%`) | **Fatal server crash** — see SC-01a |

**Conclusion:** no file outside ROOT was served in testing — traversal attempts currently *collapse back inside* the root. But that protection is accidental (dependent on `normalize()` rewriting the path, not on the check failing). The guard remains flawed: a sibling directory whose name extends `ROOT` (e.g. `ROOT` vs `ROOT-backup`) would pass the prefix test and be readable.

**Recommended Fix:**
1. Wrap `decodeURIComponent` in try/catch
2. Use `path.resolve()` and verify the resolved path is under ROOT
3. Add explicit file extension whitelist
4. Reject paths containing `..` segments outright

```javascript
try {
  urlPath = decodeURIComponent(urlPath);
} catch (e) {
  send(res, 400, 'Bad Request', 'text/plain');
  return;
}
const resolved = path.resolve(ROOT, urlPath);
if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
  send(res, 403, 'Forbidden', 'text/plain');
  return;
}
```

### SC-01a: Dev-Server DoS — One Malformed Request Kills the Whole Server
**Severity:** Critical (confirmed live twice)
**File:** `tools/server.js:42`
**Description:** `decodeURIComponent(new URL(req.url, 'http://x').pathname)` throws `URIError` on malformed percent-encoding (e.g. a bare `%`). The exception is uncaught inside the request handler; Node's default behavior terminates the entire process.

**Runtime evidence (×2 fresh server instances, 2026-11-02):**
```
C:\...\tools\server.js:42
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
                ^

URIError: URI malformed
    at decodeURIComponent (<anonymous>)
    at Server.<anonymous> (...\tools\server.js:42:17)
    at Server.emit (node:events:509:28)
    at parserOnIncoming (node:_http_server:1282:12)
    ...
Node.js v24.19.0
Exited with code 1
```
`curl http://127.0.0.1:8123/%` → HTTP code `000` (connection died mid-response); all subsequent requests → connection refused.

**Fix:** wrap lines 42-50 in try/catch → respond `400 Bad Request`; never let a handler exception escape the handler.

### SC-02: Unsafe HTML Rendering in Preview
**Severity:** High  
**File:** `js/preview.js:112-152` (`inject()` method)  
**Description:** The `inject()` method processes user-project HTML and replaces external `<link>` and `<script>` tags with embedded content. However:
- The method uses `.replace()` with regex on raw HTML strings
- `mapFor()` function checks if a URL matches by filename only — could be bypassed
- Injected console bridge (`injectConsoleBridge`) overrides `console` methods with `postMessage` to parent — no `targetOrigin` restriction
- `window.onerror` forwarder also uses `postMessage` with `'*'` target
- If a user imports a project with externally-hosted scripts, those scripts execute in the sandboxed iframe

**Evidence:** 
```javascript
injectConsoleBridge(content) {
  const bridge = `<script>
  ['log','info','warn','error','debug'].forEach(function(level) {
    var old = console[level];
    console[level] = function() {
      try { window.parent.postMessage({ __kingcode: true, type: 'console', level: level, parts: fmt(arguments) }, '*'); } catch (e) {}
      try { old.apply(console, arguments); } catch (e) {}
    };
  });
  // ... window.onerror + unhandledrejection forwarders ...
  </script>`;
  return bridge + content;
}
```

The `'*'` targetOrigin in `postMessage` means any receiver can listen — no origin validation.

**Recommended Fix:**
1. Add `targetOrigin` based on `location.origin` 
2. Validate imported files against allowed domains
3. Sanitize HTML content before injection (remove `on*` attributes, `javascript:` URLs)
4. Use `sandbox` attribute more restrictively on preview iframe
5. Consider CSP headers for the preview environment

### SC-03: localStorage Exposure
**Severity:** Medium  
**File:** `js/utils.js:40-58`, `js/state.js:88-106`  
**Description:** All project data is stored in plaintext `localStorage`:
- No encryption of sensitive project data
- Shared across all same-origin tabs/windows — concurrent edits cause conflicts
- No quota exceeded handling beyond `KC.limits.maxFiles`
- `U.storage.usage()` calculates size but no action on quota exceeded
- Version key `kingcode:state:v1` — future incompatibility risk

**Evidence:** 
```javascript
storage: {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      console.warn('[kingCode] storage read failed:', e);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[kingCode] storage write failed:', e);
      return false;
    }
  }
}
```

**Recommended Fix:**
1. Add quota warning and graceful degradation when approaching limit
2. Consider `idb-keyval` or `localforage` for IndexedDB backend with localStorage fallback
3. Add `storage` event listeners for inter-tab conflict detection
4. Enforce `KC.limits.maxFiles` and `KC.limits.consoleMax` consistently

### SC-04: No Content Security Policy
**Severity:** Medium  
**File:** `index.html` (entire document)  
**Description:** No `<meta http-equiv="Content-Security-Policy">` element in the document. The preview iframe has:
```html
<iframe id="preview-frame" sandbox="allow-scripts allow-forms allow-modals allow-popups"
        allowtransparency="true" title="معاينة المشروع"></iframe>
```
The sandbox is permissive: allows scripts, forms, mods, and popups. Missing `allow-same-origin` restricts iframe to same-origin, but also missing `script-src` directive means iframe scripts can load from anywhere.

**Evidence:** Missing CSP meta tag; sandbox attribute list is incomplete for strict isolation.

**Recommended Fix:**
1. Add CSP meta tag: `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-src 'none';`
2. Refine preview iframe sandbox: `sandbox="allow-scripts allow-forms"` (remove allow-modals, allow-popups)
3. Add `referrer-policy` meta tag

### SC-05: No Input Validation on File Imports
**Severity:** Medium  
**File:** `js/files.js:172-199`, `js/utils.js:114-125`  
**Description:** `importProject()` parses raw JSON from user file without schema validation:
- `JSON.parse(await U.readText(file))` with no structure validation
- `U.sanitizeFiles()` only checks if result is an array and has basic properties
- No validation of file content types, sizes, or malicious code embedded in content
- `STATE.data.files = files` directly overwrites without merge/safety check

**Evidence:** 
```javascript
importProject() {
  const input = U.$('#import-json-input');
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await U.readText(file));  // Uncaught SyntaxError can crash
      const files = U.sanitizeFiles(parsed);              // Minimal validation
      if (!files) throw new Error('بنية غير known');
      STATE.data.files = files;                           // Direct overwrite
      // ...
    } catch (e) {
      UI.toast('فشل استيراد JSON: ' + e.message, 'error');
    }
  };
}
```

**Recommended Fix:**
1. Validate parsed JSON structure before processing
2. Limit file size for imports
3. Sanitize file content (escape HTML in non-code contexts)
4. Add maximum import size check
5. Validate each file name against reserved patterns

### SC-06: Console Bridge No Origin Validation
**Severity:** Medium  
**File:** `js/preview.js:155-191` (`injectConsoleBridge`)  
**Description:** The console bridge posts messages to `window.parent` with `'*'` targetOrigin:
```javascript
window.parent.postMessage({ __kingcode: true, type: 'console', level: level, parts: fmt(arguments) }, '*');
```
This means any window can receive and potentially act on these messages. If the iframe is embedded in an external site (unlikely given PWA nature, but possible via iframe embedding), the external site could listen for kingCode console messages.

**Evidence:** Same function as SC-02 evidence; `'*'` is the third parameter to `postMessage`.

**Recommended Fix:**
1. Use `window.parent.location.origin` as targetOrigin
2. Add message source validation in receiver
3. Consider `MessageChannel` for direct iframe-parent communication

### SC-07: Service Worker Cache Poisoning
**Severity:** Low  
**File:** `js/service-worker.js:98-106`  
**Description:** `backgroundUpdate()` blindly caches any fetched 200 response:
```javascript
function backgroundUpdate(request, cache) {
  return fetch(request)
    .then(res => {
      if (res && res.status === 200) {
        return cache.put(request, res.clone());
      }
    })
    .catch(() => { /* offline: ignore silently */ });
}
```
No response validation beyond status 200. Could cache malicious content if server is compromised.

**Evidence:** Function code shows no content validation.

**Recommended Fix:**
1. Add response MIME type validation
2. Cache only known asset types (text/html, text/css, application/javascript, image/*, font/*)
3. Add cache control headers or Etag validation

### SC-08: Wildcard CORS on Every Response (Runtime-Confirmed)
**Severity:** Medium (dev-only surface, but directly exploitable)
**File:** `tools/server.js:36`
**Description:** every response — including all source files — carries `Access-Control-Allow-Origin: '*'` (set in `send()`). While the dev server runs, ANY website open in the user's browser can fetch `http://127.0.0.1:8123/...` cross-origin and read the full project source (there is no authentication and no host validation).

```javascript
res.writeHead(code, {
  'Content-Type': type,
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*'   // ← any origin can read this server
});
```

**Fix:** drop the header entirely for the default same-origin web flow (the PWA does not need it cross-origin), or restrict to `http://localhost:8123`; optionally require `Host: localhost`.

### SC-09: MIME Map Serves Every `.json` as `application/manifest+json` (Runtime-Confirmed)
**Severity:** Low
**File:** `tools/server.js:22`
**Description:** the MIME map maps `.json` to `application/manifest+json`, so ALL JSON files are served as web-app manifests with that `Content-Type` (live-confirmed header on `/manifest.json`). Correct for the PWA manifest itself, incorrect for every other JSON file; types such as `application/manifest+json` can confuse clients that type-check responses.

```javascript
'.json': 'application/manifest+json', /* PWA manifest */
```

**Fix:** map `.json` → `application/json`; add a dedicated `.webmanifest` entry (already present, line 28) for the manifest.

---

## High-Severity Security Recommendations Summary

| Priority | Issue | File | Fix Category |
|----------|-------|------|--------------|
| P0 (Critical) | Dev-server DoS via malformed URL + accidental path-boundary (SC-01 / SC-01a) — **runtime-confirmed ×2** | `tools/server.js:42,46` | try/catch → 400; `resolve()` + trailing-sep boundary check |
| P1 (High) | Unsafe HTML in preview | `js/preview.js` | HTML sanitization, CSP, sandbox |
| P1 (High) | localStorage plaintext | `js/utils.js`, `js/state.js` | Quota handling, inter-tab coordination |
| P2 (Medium) | No CSP meta tag | `index.html` | Add Content-Security-Policy |
| P2 (Medium) | Import validation | `js/files.js` | JSON schema validation, size limits |
| P2 (Medium) | postMessage `*` targetOrigin | `js/preview.js` | Origin-restricted messaging |
| P2 (Medium) | Wildcard CORS leaks repo source to any open website while server runs (SC-08) | `tools/server.js:36` | Remove/restrict ACAO header |
| P3 (Low) | SW cache poisoning | `js/service-worker.js` | Response type validation |
| P3 (Low) | `.json` MIME mis-map (SC-09) | `tools/server.js:22` | Map `.json` → `application/json` |
| P3 (Low) | Duplicate CSS classes | `css/main.css`, `css/components.css` | Style consolidation |

---

## Low-Severity Security Findings

- **Missing `referrer-policy` meta tag** — information leakage potential
- **`editText` function referenced but not implemented** — CLOSED 2026-11-02 (false positive): no reference to `editText` exists in any code file at HEAD; mentioned only by the audit documents themselves
- **`pref:sidebarOpen` recursion** — while primarily a bug (CB-01), also prevents pref preference persistence
- **No rate limiting on storage operations** — could enable quota exhaustion DoS
- **Console messages visible in devtools** — no production filtering
- **`window.KINGCODE_READY` global exposure** — may expose internal state; consider encapsulating

---

## Security Testing Requirements

After fixes are implemented, verify:

1. **Server URL handling**: Test with malformed URLs, `../` sequences, percent-encoded paths
2. **Preview HTML sanitization**: Inject `<script>alert('xss')</script>` in editor → verify does not execute in preview
3. **Import validation**: Test with malformed JSON, oversized files, unexpected structure
4. **postMessage origin**: Verify messages only reach intended origin
5. **CSP enforcement**: Test pages render correctly with CSP headers
6. **Storage quota**: Simulate quota exceeded, verify graceful handling
7. **Service Worker cache**: Verify only expected assets are cached

---

## Immediate Action Items

1. **Fix `tools/server.js` (SC-01a / SC-01)** — try/catch around `decodeURIComponent` (respond 400), `path.resolve()` + trailing-separator boundary check; prevents the confirmed DoS and accidental-only traversal handling
2. **Remove/restrict `Access-Control-Allow-Origin: '*'` (SC-08)** — the PWA does not need cross-origin allowance
3. **Fix `.json` MIME map (SC-09)** — `application/json` for generic JSON
4. **Fix toolbar double-binding (CB-01)** — remove either the inline `onclick` attributes or the duplicate `addEventListener` calls
5. **Fix `js/state.js` `pref:sidebarOpen` recursion** — historically proven; re-confirm stays fixed after UI wiring changes
6. **Add CSP meta tag to `index.html`** — security best practice
7. **Refine preview iframe sandbox** — remove `allow-modals`, `allow-popups` if not needed
8. **Add import JSON schema validation** — prevents crashes from malformed imports
9. **Restrict `postMessage` targetOrigin** — use `location.origin` instead of `'*'`

---

## حالة التنفيذ — المرحلة 1 (v1.0.4) — 2026-11-02

| البند | الحالة | الكوميت | دليل حي |
|------|--------|---------|---------|
| SC-01a انهيار الترميز (DoS) | **مُصلَح** | `558845d` | `GET /foo%bar` → **400 Bad Request**؛ الطلب مباشرة بعده → **200** (كان الانهيار مؤكداً حياً ×2) |
| SC-01 عبور الحدود | **مُصلَح** | `558845d` | `/..%2f..%2fREADME.md` → **403** (كان 200) ونسخة الملف المفقود → **403** (لم يبق أوراكل تسريب الوجود عبر 404)؛ إضافات تحصينية: رفض البايت الفارغ `\0` (400) ومقارنة الجذر مع فاصله النهائي لحصر الأشقاء مثل `kingcode-x` |
| SC-08 CORS عالمي | **مُصلَح** | `5cea36c` | `curl -I` على `/index.html`: ترويسة `Access-Control-Allow-Origin` **غير موجودة** (كانت `*` على كل الاستجابات) |
| SC-09 MIME الـ `.json` | **مُصلَح** | `5cea36c` | كل `.json` ← `application/json`، و`manifest.json` وحده يحفظ `application/manifest+json` (تحقق حي بالترويسة) |

تبقى من البنود الحرجة: SC-03 (تخزين نصي) وSC-05 وSC-06 وSC-07 → ضمن **المرحلة 2**؛ أما SC-02/SC-04 فقد عولجا جزئياً في `1111bab` (CSP meta + تضييق sandbox) واستكمال تضييقهما مذكرون في المرحلة 2.