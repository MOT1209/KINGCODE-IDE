'use strict';
/* GitHub REST client (server-side only). The token comes from the bridge environment
   (KINGCODE_GITHUB_TOKEN or GITHUB_TOKEN) and is never sent to the browser.
   Interactive OAuth requires an OAuth app registered by the owner — not implemented here. */
const { HttpError } = require('./util');

function api() { return process.env.KINGCODE_GITHUB_API || 'https://api.github.com'; }
function token() { return process.env.KINGCODE_GITHUB_TOKEN || process.env.GITHUB_TOKEN || ''; }
const SLUG = /^[A-Za-z0-9_.-]{1,100}$/;

async function call(method, path, body) {
  const t = token();
  if (!t) throw new HttpError(401, 'No GitHub token configured on the bridge (set KINGCODE_GITHUB_TOKEN).', 'no_token');
  const res = await fetch(api() + path, {
    method,
    headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'kingcode-bridge', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  }).catch(e => { throw new HttpError(502, 'GitHub unreachable: ' + e.message, 'upstream'); });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  if (!res.ok) throw new HttpError(res.status === 401 || res.status === 403 || res.status === 404 ? res.status : 502, (data && data.message) || 'GitHub error', 'github');
  return data;
}

function repoPath(owner, repo) {
  if (!SLUG.test(owner || '') || !SLUG.test(repo || '')) throw new HttpError(400, 'invalid owner/repo', 'bad_input');
  return `/repos/${owner}/${repo}`;
}
const slim = x => ({ number: x.number, title: x.title, state: x.state, url: x.html_url, user: x.user && x.user.login, draft: x.draft });

module.exports = {
  configured: () => !!token(),
  listPulls: async (o, r, state = 'open') => (await call('GET', `${repoPath(o, r)}/pulls?state=${encodeURIComponent(state)}&per_page=30`)).map(slim),
  listIssues: async (o, r, state = 'open') => (await call('GET', `${repoPath(o, r)}/issues?state=${encodeURIComponent(state)}&per_page=30`)).filter(i => !i.pull_request).map(slim),
  createPull: async (o, r, { title, head, base, body }) => slim(await call('POST', `${repoPath(o, r)}/pulls`, { title: String(title), head: String(head), base: String(base), body: String(body || '') })),
  createIssue: async (o, r, { title, body }) => slim(await call('POST', `${repoPath(o, r)}/issues`, { title: String(title), body: String(body || '') }))
};
