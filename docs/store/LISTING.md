# Store listing copy (draft, Arabic + English)

Written to match what the app **actually does** (verified in `README.md` and the E2E suite). Do not add claims about AI, Git, a terminal, accounts, cloud sync or extensions — none exist, and misleading store text risks rejection. Character limits are the ones I know (**verify** current limits).

## Names

| | Text | Length |
|---|---|---|
| Name (AR) | `kingCode — محرر أكواد` | 21 |
| Name (EN) | `kingCode: Code Editor` | 21 |

## Short description (Google Play limit: 80)

- **AR (65):** محرر أكواد يعمل دون إنترنت مع معاينة حية — مشاريعك تبقى على جهازك
- **EN (73):** Offline code editor with live preview. Your projects stay on your device.

## Full description — Arabic

kingCode محرر أكواد يعمل داخل التطبيق ودون اتصال بالإنترنت، بواجهة عربية من اليمين إلى اليسار.

**ما يقدمه:**
• محرر CodeMirror مع تلوين الصياغة لـ HTML وCSS وJavaScript وJSON وMarkdown وPython وSQL وYAML وXML
• مشاريع بملفات ومجلدات متداخلة، مع تصفية سريعة بالاسم
• معاينة حية معزولة وكونسول يعرض مخرجات console وأخطاء الشيفرة
• بحث واستبدال، تعليق بسرعة، لوحة أوامر (Ctrl+P) واختصارات لوحة المفاتيح
• استيراد وتصدير المشاريع (JSON) أو تصدير صفحة HTML مستقلة، ونسخة احتياطية تلقائية قبل الاستبدال
• يعمل على الجوال والآيباد وسطح المكتب بتخطيط مخصص لكل منها
• مظهر داكن وفاتح وعدة سمات للمحرر

**الخصوصية:** كل مشاريعك تبقى على جهازك. لا حسابات، لا تتبع، لا إعلانات، ولا يرسل التطبيق ملفاتك إلى أي مكان. المعاينة تعمل دون وصول للشبكة.

**ما ليس فيه (حاليًا):** طرفية (terminal) حقيقية، تكامل Git، مساعد ذكاء اصطناعي، مزامنة سحابية.

## Full description — English

kingCode is a code editor that works offline, with an Arabic right-to-left interface.

**What it offers:**
• CodeMirror editor with syntax highlighting for HTML, CSS, JavaScript, JSON, Markdown, Python, SQL, YAML and XML
• Projects with nested files and folders, plus quick filtering by name
• Sandboxed live preview with a console showing `console` output and script errors
• Search and replace, quick comments, a command palette (Ctrl+P) and keyboard shortcuts
• Import/export projects (JSON) or export a standalone HTML page, with an automatic backup before replacing a project
• Works on phones, tablets and desktops with a layout designed for each
• Dark and light themes and several editor themes

**Privacy:** all your projects stay on your device. No accounts, no tracking, no ads, and the app never uploads your files. The preview has no network access.

**Not included (yet):** a real terminal, Git integration, an AI assistant, cloud sync.

## Keywords / tags (pick per store limits)

code editor, offline, HTML, CSS, JavaScript, live preview, Arabic, RTL, programming, IDE, PWA

## Draft questionnaire answers — **you** must review and submit these yourself

| Form | Draft answer | Basis |
|---|---|---|
| Google Play → Data safety: data collected | **None** | No network calls, no analytics, no accounts, no cookies (`store:check` scans the shipped code); data stays in IndexedDB on the device |
| Data shared with third parties | **None** | No third-party services |
| Data encrypted in transit / deletion | Not applicable (no data leaves the device); user can clear app data or uninstall | `privacy.html` |
| Google Play → Ads | No ads | — |
| Content rating | Utility/developer tool, no user-generated content shared between users, no violence/sexual/gambling content | The app has no social features; **answer the live questionnaire yourself** |
| Target audience | General/adult developers; not designed for children | Developer tool |
| Microsoft Store → age rating | Complete the IARC questionnaire truthfully (no online interactions, no purchases, no location) | **verify** |
| Privacy policy URL | `https://APP_ORIGIN/privacy.html` | `privacy.html` (AR + EN) |
| Support contact | GitHub issues of the repository, plus an email you choose | `privacy.html` points to issues |

If any of these facts changes (accounts, sync, AI that contacts a server, analytics), **update `privacy.html` and these answers before releasing that feature** — the policy page says so.
