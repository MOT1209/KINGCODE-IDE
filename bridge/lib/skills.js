'use strict';
/* King Skills — each skill is a folder $KINGCODE_HOME/skills/<name>/SKILL.md with YAML-ish frontmatter
   (name, description). Skills can be created, edited, validated, enabled/disabled, exported/imported as JSON
   bundles and injected into agent prompts; every use is logged. */
const fs = require('fs');
const path = require('path');
const { HttpError, home, readJson, writeJson, id: vid } = require('./util');
const audit = require('./audit');

const dir = () => path.join(home(), 'skills');
const statePath = () => path.join(home(), 'skills-state.json');
const MAX_BODY = 100 * 1024;

function parse(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) { const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line); if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, ''); }
  return { meta, body: m[2] };
}
const serialize = (meta, body) => `---\nname: ${meta.name}\ndescription: ${meta.description}\n---\n${body}`;

/** Returns a list of problems (empty = valid). */
function validate(name, text) {
  const problems = [];
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name || '')) problems.push('name must be lowercase letters, digits and hyphens (max 64)');
  if (typeof text !== 'string') return [...problems, 'content must be a string'];
  if (text.length > MAX_BODY) problems.push('SKILL.md exceeds 100 KB');
  const { meta, body } = parse(text);
  if (!meta.name) problems.push('frontmatter "name" is missing');
  else if (meta.name !== name) problems.push(`frontmatter name "${meta.name}" must equal the skill folder name "${name}"`);
  if (!meta.description) problems.push('frontmatter "description" is missing');
  else if (meta.description.length > 1024) problems.push('description exceeds 1024 characters');
  if (!body.trim()) problems.push('skill body is empty');
  return problems;
}

const states = () => readJson(statePath(), { disabled: [], logs: [] });
const saveStates = s => writeJson(statePath(), s);

const api = {
  validate,
  list() {
    let names = []; try { names = fs.readdirSync(dir()); } catch { /* none yet */ }
    const st = states();
    return names.filter(n => fs.existsSync(path.join(dir(), n, 'SKILL.md'))).sort().map(n => {
      const text = fs.readFileSync(path.join(dir(), n, 'SKILL.md'), 'utf8');
      const { meta } = parse(text);
      return { name: n, description: meta.description || '', enabled: !st.disabled.includes(n), problems: validate(n, text) };
    });
  },
  get(name) {
    vid(name, 'skill name');
    const p = path.join(dir(), name, 'SKILL.md');
    if (!fs.existsSync(p)) throw new HttpError(404, 'skill not found', 'not_found');
    return { name, content: fs.readFileSync(p, 'utf8'), enabled: !states().disabled.includes(name) };
  },
  /** Create or replace (edit / update). */
  save(name, content) {
    vid(name, 'skill name');
    const problems = validate(name, content);
    if (problems.length) throw new HttpError(422, 'invalid skill: ' + problems.join('; '), 'invalid_skill');
    fs.mkdirSync(path.join(dir(), name), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(dir(), name, 'SKILL.md'), content, { mode: 0o600 });
    audit.log('skill.save', { name });
    return { name };
  },
  create(name, description, body) { return api.save(name, serialize({ name, description }, body)); },
  setEnabled(name, enabled) {
    api.get(name);
    const st = states(); st.disabled = st.disabled.filter(n => n !== name); if (!enabled) st.disabled.push(name); saveStates(st);
    audit.log('skill.enable', { name, enabled: !!enabled }); return { name, enabled: !!enabled };
  },
  remove(name) {
    api.get(name);
    fs.rmSync(path.join(dir(), name), { recursive: true, force: true });
    const st = states(); st.disabled = st.disabled.filter(n => n !== name); saveStates(st);
    audit.log('skill.delete', { name }); return { ok: true };
  },
  exportBundle(names) {
    const all = api.list().filter(s => !names || names.includes(s.name));
    return { format: 'kingcode-skills/1', skills: all.map(s => ({ name: s.name, content: api.get(s.name).content })) };
  },
  importBundle(bundle, { overwrite = false } = {}) {
    if (!bundle || bundle.format !== 'kingcode-skills/1' || !Array.isArray(bundle.skills) || bundle.skills.length > 200) throw new HttpError(400, 'unsupported skills bundle', 'bad_input');
    const result = { imported: [], skipped: [], errors: [] };
    for (const s of bundle.skills) {
      try {
        if (!s || typeof s.name !== 'string') throw new Error('entry without a name');
        if (!overwrite && fs.existsSync(path.join(dir(), s.name))) { result.skipped.push(s.name); continue; }
        api.save(s.name, s.content); result.imported.push(s.name);
      } catch (e) { result.errors.push({ name: s && s.name, error: e.message }); }
    }
    return result;
  },
  /** Builds the prompt prefix for the enabled skills named in `names` and records an execution log. */
  inject(names, ctx = {}) {
    const parts = [];
    for (const n of names || []) {
      const s = api.get(n);
      if (!s.enabled) throw new HttpError(409, `skill "${n}" is disabled`, 'disabled');
      parts.push(`## Skill: ${n}\n${parse(s.content).body.trim()}`);
      const st = states(); st.logs.push({ t: new Date().toISOString(), skill: n, ...ctx }); st.logs = st.logs.slice(-500); saveStates(st);
    }
    return parts.length ? parts.join('\n\n') + '\n\n---\n\n' : '';
  },
  logs: () => states().logs.slice(-200)
};

module.exports = api;
