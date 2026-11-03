/* =========================================================
 * kingCode — config.js
 * التهيئة المركزية: المفاتيح، القوالب، الخريطة اللغوية، والخيارات
 * ========================================================= */
'use strict';

/** @typedef {{name:string, content:string}} KCFile */

const KC = {

  /** مصفوفة التوقيع — يُغيَّر عند تعديل بنية التخزين */
  version: 'kingCode ' + '1.2.0',

  /** فترات debounce (مللي ثانية) */
  timing: {
    autosave: 500,
    preview: 450,
    persist: 250,
    toast: 3200
  },

  /** حدود */
  limits: {
    consoleMax: 200,
    tabsMax: 12,
    maxFiles: 60,
    maxFileChars: 2000000,
    maxDepth: 8,       // أقصى عمق مسار (عدد المقاطع)
    maxPathChars: 200
  },

  /* سمعات UI */
  ui: {
    sidebarWidth: 240,
    previewMin: 240,
    previewMaxRatio: 0.65,
    mobileQuery: '(max-width: 767px)',
    tabletQuery: '(max-width: 1023px)'
  },

  /* ------------------------------------------------
   * ملفات المشروع الافتراضية (أول تشغيل)
   * ------------------------------------------------ */
  DEFAULT_FILES: [
    {
      name: 'index.html',
      content: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تطبيقي الأول ⚡</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="card">
    <h1>مرحباً بك في <span class="grad">kingCode</span> 👑</h1>
    <p>هذا مشروعك الافتراضي. عدّل الملفات وشاهد المعاينة تتجدد فورًا.</p>
    <button id="magicBtn">✨ جرّب هذا الزر</button>
    <p id="magicOut"></p>
  </main>
  <script src="script.js"><\/script>
</body>
</html>`
    },
    {
      name: 'style.css',
      content: `/* kingCode — أنماط المشروع الافتراضية */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, "Segoe UI", Tahoma, sans-serif;
  background: linear-gradient(135deg, #0b1522, #12253a);
  color: #e8eef7;
  padding: 24px;
}

.card {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 18px;
  padding: 32px 36px;
  max-width: 520px;
  text-align: center;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
}

h1 { font-size: 1.7rem; margin-bottom: 10px; }

.grad {
  background: linear-gradient(90deg, #4da3ff, #8ecbff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

p { color: #b9c7da; line-height: 1.9; margin: 8px 0; }

button {
  margin-top: 14px;
  padding: 12px 26px;
  font-size: 1rem;
  color: #fff;
  background: linear-gradient(90deg, #4da3ff, #3b8be6);
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

button:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(77, 163, 255, 0.35); }`
    },
    {
      name: 'script.js',
      content: `// kingCode — منطق المشروع الافتراضي
console.log('⚡ script.js يعمل الآن — هذه رسالة كونسول حقيقية!');

const messages = [
  'ما شاء الله، اللغة تتعرف عليك 🎯',
  'هذه المعاينة تعيش داخل sandbox آمن 🔐',
  'كل شيء يعمل دون إنترنت 🛜',
  'جرّب لوحة الأوامر: Ctrl + P ⌘'
];
let i = 0;

document.getElementById('magicBtn').addEventListener('click', () => {
  document.getElementById('magicOut').textContent = messages[i++ % messages.length];
  console.log('نقرة رقم', i);
});

console.info('نصيحة: Ctrl + S يفتح لوحة الحفظ اليدوي… لا، بل يضيف إشارة حفظ 😉');`
    }
  ],

  /* ------------------------------------------------
   * قوالب إنشاء ملفات جديدة حسب الامتداد
   * ------------------------------------------------ */
  TEMPLATES: {
    html: ['index.html', `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>صفحة جديدة</title>
</head>
<body>

</body>
</html>`],
    js: ['app.js', '// كود جديد\nconsole.log("hello");\n'],
    json: ['data.json', '{\n  "type": "kingCode",\n  "ok": true\n}\n'],
    md: ['README.md', '# مشروعي\n\nوصف قصير هنا.\n'],
    css: ['style.css', 'body {\n  font-family: sans-serif;\n}\n'],
    txt: ['notes.txt', ''],
    py: ['main.py', 'def main():\n    print("hello")\n\n\nif __name__ == "__main__":\n    main()\n'],
    sql: ['query.sql', '-- استعلام\nSELECT * FROM users;\n'],
    yml: ['config.yml', 'app:\n  name: kingCode\n  offline: true\n'],
    xml: ['data.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n</root>\n'],
    svg: ['icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#4da3ff"/></svg>'],
    htm: null, mjs: 'js', markdown: 'md'
  },

  /* ------------------------------------------------
   * خريطة اللغة: امتداد → {label, mode, color}
   * mode = نمط CodeMirror
   * color = لون التوكن في قائمة الملفات
   * ------------------------------------------------ */
  LANGS: {
    html: { label: 'HTML', mode: 'htmlmixed', color: '#e44d26' },
    htm: { label: 'HTML', mode: 'htmlmixed', color: '#e44d26' },
    css: { label: 'CSS', mode: 'css', color: '#7d8ff4' },
    js: { label: 'JavaScript', mode: { name: 'javascript', globalVars: true }, color: '#e8c545' },
    mjs: { label: 'JS Module', mode: { name: 'javascript', globalVars: true }, color: '#e8c545' },
    json: { label: 'JSON', mode: 'application/json', color: '#9ece6a' },
    md: { label: 'Markdown', mode: 'markdown', color: '#5ccfe6' },
    markdown: { label: 'Markdown', mode: 'markdown', color: '#5ccfe6' },
    py: { label: 'Python', mode: 'python', color: '#4b8bbe' },
    sql: { label: 'SQL', mode: 'sql', color: '#f79064' },
    yml: { label: 'YAML', mode: 'yaml', color: '#c3aac3' },
    yaml: { label: 'YAML', mode: 'yaml', color: '#c3aac3' },
    xml: { label: 'XML', mode: 'xml', color: '#ff7728' },
    svg: { label: 'SVG', mode: 'xml', color: '#ffb86c' },
    txt: { label: 'نص', mode: 'null', color: '#9aa4b2' }
  },

  /* لوحة المواضيع المعروضة في الإعدادات */
  THEMES: [
    { id: 'ayu-mirage', label: 'Ayu Mirage' },
    { id: 'dracula', label: 'Dracula' },
    { id: 'material-darker', label: 'Material Darker' },
    { id: 'monokai', label: 'Monokai' },
    { id: 'nord', label: 'Nord' },
    { id: 'base16-dark', label: 'Base16 Dark' },
    { id: 'eclipse', label: 'Eclipse (فاتح)' }
  ],

  /* أوامر لوحة الأوامر — تُنشر في ui.js */
  PALETTE_MODES: { command: 'الأمر', file: 'ملف', setting: 'الإعدادات' }
};

/* واجهات مساعدة على مستوى KC */
KC.langFor = function langFor(name) {
  const ext = extOf(name);
  return (ext && KC.LANGS[ext]) || KC.LANGS.txt;
};
KC.extOf = extOf;
/** امتداد الملف من اسم الملف الأخير في المسار فقط (نقطة داخل اسم مجلد لا تُحتسب) */
function extOf(name) {
  const base = String(name || '').split('/').pop();
  if (!base.includes('.')) return '';
  return base.split('.').pop().toLowerCase();
}

/** يعيد [اسم, محتوى] افتراضيين لملف جديد حسب الامتداد */
KC.templateFor = function templateFor(name) {
  const ext = KC.extOf(name);
  const t = KC.TEMPLATES[ext];
  if (Array.isArray(t)) return { content: t[1] };
  if (t === 'js' || t === 'md') return KC.templateFor(name.replace(/\.\w+$/, '.' + t));
  return { content: '' };
};
