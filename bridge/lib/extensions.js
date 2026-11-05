'use strict';
/* King Extensions — registry with manifest validation, compatibility checks and a permission model.
   Installed extensions live in $KINGCODE_HOME/extensions/<id>/. The bridge only stores and describes them;
   code execution is sandboxed in the browser (js/extensions-host.js: a dedicated Worker, no DOM, no network,
   only the permissions the user granted). */
const fs = require('fs');
const path = require('path');
const { HttpError, home, readJson, writeJson, id: vid, satisfies, cmpVer } = require('./util');
const audit = require('./audit');

const PERMISSIONS = ['ui.notify', 'commands.register', 'files.read', 'files.write', 'git', 'terminal', 'network'];
const HOST_VERSION = '1.5.1';
const dir = () => path.join(home(), 'extensions');
const statePath = () => path.join(home(), 'extensions-state.json');
const states = () => readJson(statePath(), { ext: {} });

function validateManifest(m) {
  const problems = [];
  if (!m || typeof m !== 'object') return ['manifest must be an object'];
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(m.id || '')) problems.push('id is invalid');
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 80) problems.push('name is required (max 80)');
  if (!/^\d+\.\d+\.\d+$/.test(m.version || '')) problems.push('version must be x.y.z');
  if (typeof m.main !== 'string' || !/^[\w./-]+\.js$/.test(m.main) || m.main.includes('..') || m.main.startsWith('/')) problems.push('main must be a relative .js path');
  if (!Array.isArray(m.permissions) || m.permissions.some(p => !PERMISSIONS.includes(p))) problems.push('permissions must be a subset of: ' + PERMISSIONS.join(', '));
  if (m.engines && m.engines.kingcode !== undefined && typeof m.engines.kingcode !== 'string') problems.push('engines.kingcode must be a string');
  return problems;
}

function describe(id) {
  const base = path.join(dir(), id);
  const manifest = readJson(path.join(base, 'kingcode-extension.json'), null);
  if (!manifest) return null;
  const st = states().ext[id] || {};
  const range = manifest.engines && manifest.engines.kingcode;
  return {
    id, name: manifest.name, version: manifest.version, description: manifest.description || '',
    permissions: manifest.permissions, granted: (st.granted || []).filter(p => manifest.permissions.includes(p)),
    enabled: st.enabled === true, compatible: satisfies(HOST_VERSION, range), engines: range || '*', main: manifest.main
  };
}

const api = {
  PERMISSIONS, HOST_VERSION,
  list() { let ids = []; try { ids = fs.readdirSync(dir()); } catch { /* none */ } return ids.map(describe).filter(Boolean); },
  /** bundle = { manifest, files: { "path": "content" } } */
  install(bundle, { update = false } = {}) {
    if (!bundle || typeof bundle !== 'object' || !bundle.manifest || typeof bundle.files !== 'object') throw new HttpError(400, 'bundle needs "manifest" and "files"', 'bad_input');
    const problems = validateManifest(bundle.manifest);
    if (problems.length) throw new HttpError(422, 'invalid manifest: ' + problems.join('; '), 'invalid_manifest');
    const m = bundle.manifest, existing = describe(m.id);
    if (existing && !update) throw new HttpError(409, 'extension already installed (use update)', 'exists');
    if (existing && update && cmpVer(m.version, existing.version) <= 0) throw new HttpError(409, `version ${m.version} is not newer than ${existing.version}`, 'not_newer');
    if (!satisfies(api.HOST_VERSION, m.engines && m.engines.kingcode)) throw new HttpError(422, `incompatible: requires kingCode ${m.engines.kingcode}, running ${api.HOST_VERSION}`, 'incompatible');
    if (!bundle.files[m.main]) throw new HttpError(422, 'main file is missing from files', 'invalid_manifest');
    const entries = Object.entries(bundle.files);
    if (entries.length > 200) throw new HttpError(413, 'too many files', 'too_large');
    let total = 0;
    for (const [p, c] of entries) {
      if (typeof c !== 'string' || !/^[\w./-]+$/.test(p) || p.includes('..') || p.startsWith('/')) throw new HttpError(422, 'bad file path: ' + p, 'invalid_manifest');
      total += c.length; if (total > 2 * 1024 * 1024) throw new HttpError(413, 'extension too large', 'too_large');
    }
    const target = path.join(dir(), m.id), tmp = target + '.new';
    fs.rmSync(tmp, { recursive: true, force: true });
    for (const [p, c] of entries) { const f = path.join(tmp, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); }
    writeJson(path.join(tmp, 'kingcode-extension.json'), m);
    fs.rmSync(target, { recursive: true, force: true }); fs.renameSync(tmp, target);
    const st = states(); st.ext[m.id] = { enabled: false, granted: update ? (st.ext[m.id] && st.ext[m.id].granted || []).filter(p => m.permissions.includes(p)) : [] }; writeJson(statePath(), st);
    audit.log(update ? 'extension.update' : 'extension.install', { id: m.id, version: m.version, permissions: m.permissions });
    return describe(m.id);
  },
  setGranted(id, granted) {
    vid(id); const d = describe(id); if (!d) throw new HttpError(404, 'extension not found', 'not_found');
    if (!Array.isArray(granted) || granted.some(p => !d.permissions.includes(p))) throw new HttpError(400, 'cannot grant permissions the extension did not declare', 'bad_input');
    const st = states(); st.ext[id] = { ...(st.ext[id] || {}), granted }; writeJson(statePath(), st);
    audit.log('extension.grant', { id, granted }); return describe(id);
  },
  setEnabled(id, enabled) {
    vid(id); const d = describe(id); if (!d) throw new HttpError(404, 'extension not found', 'not_found');
    if (enabled && !d.compatible) throw new HttpError(409, 'extension is not compatible with this kingCode version', 'incompatible');
    const st = states(); st.ext[id] = { ...(st.ext[id] || {}), enabled: !!enabled }; writeJson(statePath(), st);
    audit.log('extension.enable', { id, enabled: !!enabled }); return describe(id);
  },
  remove(id) {
    vid(id); if (!describe(id)) throw new HttpError(404, 'extension not found', 'not_found');
    fs.rmSync(path.join(dir(), id), { recursive: true, force: true });
    const st = states(); delete st.ext[id]; writeJson(statePath(), st); audit.log('extension.remove', { id }); return { ok: true };
  },
  source(id) {
    vid(id); const d = describe(id); if (!d) throw new HttpError(404, 'extension not found', 'not_found');
    return { id, main: d.main, code: fs.readFileSync(path.join(dir(), id, d.main), 'utf8') };
  }
};
module.exports = api;
