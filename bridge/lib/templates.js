'use strict';
/* King Project Builder — extensible project templates. Built-ins are plain file maps (scaffold only: nothing is
   installed or built). User templates: $KINGCODE_HOME/templates/<id>.json = { name, description, files:{path:content} }.
   "{{name}}" in file contents and paths is replaced by the project name. */
const fs = require('fs');
const path = require('path');
const { HttpError, home, readJson } = require('./util');
const audit = require('./audit');

const pkg = (name, extra) => JSON.stringify({ name, version: '0.1.0', private: true, ...extra }, null, 2) + '\n';
const BUILTIN = {
  'html': { name: 'HTML / CSS / JavaScript', files: {
    'index.html': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>{{name}}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>{{name}}</h1>\n  <script src="main.js"></script>\n</body>\n</html>\n',
    'style.css': 'body { font-family: system-ui, sans-serif; margin: 2rem; }\n', 'main.js': 'console.log("{{name}} ready");\n' } },
  'node': { name: 'Node.js', files: {
    'package.json': pkg('{{name}}', { main: 'index.js', scripts: { start: 'node index.js', test: 'node --test' } }),
    'index.js': 'console.log("Hello from {{name}}");\n', 'index.test.js': 'const test = require("node:test");\nconst assert = require("node:assert");\ntest("works", () => assert.strictEqual(1 + 1, 2));\n' } },
  'python': { name: 'Python', files: { 'main.py': 'def main():\n    print("Hello from {{name}}")\n\n\nif __name__ == "__main__":\n    main()\n', 'test_main.py': 'from main import main\n\n\ndef test_main(capsys):\n    main()\n    assert "Hello" in capsys.readouterr().out\n', 'README.md': '# {{name}}\n\nRun: `python main.py`\n' } },
  'java': { name: 'Java', files: { 'src/Main.java': 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from {{name}}");\n    }\n}\n', 'README.md': '# {{name}}\n\n`javac -d out src/Main.java && java -cp out Main`\n' } },
  'c': { name: 'C', files: { 'main.c': '#include <stdio.h>\n\nint main(void) {\n    printf("Hello from {{name}}\\n");\n    return 0;\n}\n', 'Makefile': 'all:\n\tcc -Wall -o app main.c\n\nrun: all\n\t./app\n' } },
  'cpp': { name: 'C++', files: { 'main.cpp': '#include <iostream>\n\nint main() {\n    std::cout << "Hello from {{name}}\\n";\n}\n', 'Makefile': 'all:\n\tc++ -std=c++17 -Wall -o app main.cpp\n\nrun: all\n\t./app\n' } },
  'react': { name: 'React (Vite)', note: 'Scaffold only — run `npm install` yourself.', files: {
    'package.json': pkg('{{name}}', { type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' }, devDependencies: { '@vitejs/plugin-react': '^4.3.1', vite: '^5.4.0' } }),
    'vite.config.js': 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()] });\n',
    'index.html': '<!doctype html>\n<html><head><meta charset="UTF-8"><title>{{name}}</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>\n',
    'src/main.jsx': 'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\ncreateRoot(document.getElementById("root")).render(<App />);\n',
    'src/App.jsx': 'export default function App() {\n  return <h1>{{name}}</h1>;\n}\n' } },
  'vue': { name: 'Vue (Vite)', note: 'Scaffold only — run `npm install` yourself.', files: {
    'package.json': pkg('{{name}}', { type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { vue: '^3.4.0' }, devDependencies: { '@vitejs/plugin-vue': '^5.1.0', vite: '^5.4.0' } }),
    'vite.config.js': 'import { defineConfig } from "vite";\nimport vue from "@vitejs/plugin-vue";\nexport default defineConfig({ plugins: [vue()] });\n',
    'index.html': '<!doctype html>\n<html><head><meta charset="UTF-8"><title>{{name}}</title></head><body><div id="app"></div><script type="module" src="/src/main.js"></script></body></html>\n',
    'src/main.js': 'import { createApp } from "vue";\nimport App from "./App.vue";\ncreateApp(App).mount("#app");\n', 'src/App.vue': '<template><h1>{{name}}</h1></template>\n' } },
  'nextjs': { name: 'Next.js (App Router)', note: 'Scaffold only — run `npm install` yourself.', files: {
    'package.json': pkg('{{name}}', { scripts: { dev: 'next dev', build: 'next build', start: 'next start' }, dependencies: { next: '^14.2.0', react: '^18.3.1', 'react-dom': '^18.3.1' } }),
    'app/layout.js': 'export const metadata = { title: "{{name}}" };\nexport default function RootLayout({ children }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n', 'app/page.js': 'export default function Page() {\n  return <h1>{{name}}</h1>;\n}\n' } },
  'flutter': { name: 'Flutter (minimal)', note: 'Minimal files only; run `flutter create .` to generate platform folders.', files: {
    'pubspec.yaml': 'name: app\ndescription: {{name}}\nversion: 0.1.0\nenvironment:\n  sdk: ">=3.0.0 <4.0.0"\ndependencies:\n  flutter:\n    sdk: flutter\nflutter:\n  uses-material-design: true\n',
    'lib/main.dart': 'import \'package:flutter/material.dart\';\n\nvoid main() => runApp(const MaterialApp(home: Scaffold(body: Center(child: Text(\'{{name}}\')))));\n' } },
  'react-native': { name: 'React Native (Expo, minimal)', note: 'Minimal files only — run `npm install` yourself.', files: {
    'package.json': pkg('{{name}}', { main: 'App.js', scripts: { start: 'expo start' }, dependencies: { expo: '~51.0.0', react: '18.2.0', 'react-native': '0.74.5' } }),
    'App.js': 'import { Text, View } from "react-native";\nexport default function App() {\n  return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><Text>{{name}}</Text></View>;\n}\n' } }
};

const userDir = () => path.join(home(), 'templates');
function userTemplates() {
  let out = {}; try { for (const f of fs.readdirSync(userDir())) if (f.endsWith('.json')) { const id = f.slice(0, -5); const t = readJson(path.join(userDir(), f), null); if (t && /^[a-z0-9-]{1,40}$/.test(id) && t.files && typeof t.files === 'object') out['user-' + id] = { name: t.name || id, note: t.description, files: t.files }; } } catch { /* none */ }
  return out;
}
const all = () => ({ ...BUILTIN, ...userTemplates() });

module.exports = {
  list: () => Object.entries(all()).map(([id, t]) => ({ id, name: t.name, note: t.note || '', files: Object.keys(t.files).length })),
  /** Writes the template into `dir` (workspace-relative, resolved by caller). Refuses to overwrite existing files. */
  async apply(ws, id, dir, name) {
    const t = all()[id]; if (!t) throw new HttpError(404, 'unknown template', 'not_found');
    const proj = String(name || 'my-app').replace(/[^\w .-]/g, '').slice(0, 60) || 'my-app';
    const files = Object.entries(t.files).map(([p, c]) => [path.posix.join(dir || '.', p.replace(/\{\{name\}\}/g, proj)), String(c).replace(/\{\{name\}\}/g, proj)]);
    for (const [p] of files) { const abs = await ws.resolve(p); if (fs.existsSync(abs)) throw new HttpError(409, 'would overwrite existing file: ' + p, 'exists'); }
    for (const [p, c] of files) await ws.write(p, c);
    audit.log('template.apply', { id, dir, files: files.length });
    return { created: files.map(f => f[0]), note: t.note || '' };
  }
};
