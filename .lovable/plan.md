## Reja — CodeForge/BuildForge AI ni Lovable darajasiga olib chiqish

### Preview tekshiruvi (eng avval)
`src/lib/live-preview.ts` — preview allaqachon ko'p faylli React/TSX loyihalarni qo'llab-quvvatlaydi:
- `esbuild-wasm` orqali brauzerda bundling
- `importmap` + `esm.sh` orqali npm paketlari (react, react-dom va h.k.)
- `@/`, nisbiy va absolyut import path'lar
- TSX/TS/JSX/JS/CSS/JSON loaderlar
- HTML entry sanitization

Demak preview YETARLI darajada ko'p faylli React'ni ishlatadi. Faqat: hozir HTML fayl shart emas, agar `/src/main.tsx` mavjud bo'lsa avtomatik entry sifatida olinadi. Ya'ni AI to'g'ridan-to'g'ri `index.html + src/main.tsx + src/App.tsx + komponentlar` yasashi mumkin va preview ishlaydi.

### 1-QISM: Kritik buglar

**1.1 BuildForgePanel roomId**
- `WorkspacePanel.tsx` da `BuildForgePanel` ga `roomId={roomId}` uzatish (hozir `undefined:buildforge` ostida saqlanyapti)

**1.2 ai-completions kredit yechmaydi**
- `supabase/functions/ai-completions/index.ts` ichida AI chaqirishdan oldin `consume_credits` RPC chaqirish, xato bo'lsa 402/429 qaytarish

**1.3 ai-assistant kredit muvaffaqiyatsizlikda davom etadi**
- `consume_credits` natijasi `ok=false` bo'lsa yoki RPC error bo'lsa — kod hozirgidek `continue` qilmasdan 402 qaytarsin

**1.4 Terminal eval() XSS**
- `Terminal.tsx` da `eval()` o'rniga sandboxed `<iframe sandbox="allow-scripts">` (same-origin YO'Q) yaratib, `postMessage` orqali kod yuborilsin, natijalar qaytsin
- Iframe har run uchun qayta yaratiladi, window/document/localStorage'ga foydalanuvchi kodi tegmaydi

### 2-QISM: Diff Approval tizimi (Claude Code uslubida)

**Yangi komponentlar:**
- `src/lib/diff-utils.ts` — `diff` npm paketi (`bun add diff @types/diff`) bilan unified diff hisoblash, +N/-N statistika
- `src/components/DiffApprovalCard.tsx` — bitta fayl uchun diff karta:
  - Header: fayl yo'li, [NEW]/[CHANGE] badge, +N -N
  - Body: qator-qator diff (qizil/yashil), monospace, kichik font
  - Footer: "Ha (Yes)" / "Yo'q (No)" tugmalari
- `src/components/DiffApprovalGroup.tsx` — ko'p fayl uchun, "Hammasini qabul qilish" tugmasi

**Parse:**
- AI javobini parse qilish — `[NEW_FILE: path]` / `[CHANGE_FILE: path]` markerlari bilan kod bloklarini bog'lash
- `src/lib/ai-file-blocks.ts` — yangi parser

**WorkspacePanel integratsiyasi:**
- Eski `MarkdownContent` ichidagi `CodeBlock` ning "select+copy" badge'larini olib tashlash
- AI javobida fayl markeri bo'lsa — kod blok o'rniga `DiffApprovalCard` rendr qilish
- "Ha" → `useFiles.createFile()` yoki `updateFileContent()`, "Yo'q" → karta yo'qoladi

### 3-QISM: BuildForge AI full-stack

**Yangi system prompt (`supabase/functions/ai-assistant/index.ts` ichida BuildForge rejimi uchun):**
- HAR DOIM ko'p faylli React + Vite + Tailwind loyihasi
- Standart skelet: `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/components/*`, `src/pages/*`
- Auth/ma'lumot kerak bo'lsa — backend kontrakti (Supabase jadval sxemasi, RLS) avval yoziladi, keyin frontend unga ulanadi
- Hamma fayllar `[NEW_FILE: path]` / `[CHANGE_FILE: path]` formatida, tilini ko'rsatib markdown blok ichida

**Reja bosqichi:**
- AI avval `[PLAN]` blok yuborsin: tech stack, fayl daraxti, data model, har bir CRUD
- Agar backend kerak bo'lsa-yu reja unga tegmasa — AI o'zi qayta rejalashtirsin (system prompt da qoida)

**useFiles batch yozish:**
- `useFiles.ts` ga `createOrUpdateFiles(items: {path, name, content, language}[])` qo'shish — bitta `supabase.from('files').upsert(...)` chaqiruvi
- Har bir fayl haqiqatan yaratilganini tekshirish, bo'sh content'ni rad etish va toast bilan xabar berish

### 4-QISM: UI soddalashtirish (faqat Room/editor sahifasi)

**`src/components/CodeEditor.tsx` / `CodeEditorWithAI.tsx`:**
- Monaco `fontSize: 13`, `lineHeight: 1.5`, `fontFamily: "JetBrains Mono"`

**`WorkspacePanel.tsx`, `FileExplorer.tsx`, `EditorHeader.tsx`, `EditorTabs.tsx`, `StatusBar.tsx`, `Terminal.tsx`, `LivePreview.tsx`:**
- Panel sarlavhalari: `text-xs` (11-12px), `font-medium`, sokin rang
- `rounded-xl/2xl` → `rounded-md` yoki `rounded`
- `shadow-lg`, `shadow-2xl`, neon glow, `bg-gradient-*` larni olib tashlash yoki `border-border` ingichka chegaraga almashtirish
- Ranglar O'ZGARTIRILMAYDI — faqat o'lcham, radius, soya, gradient

### Texnik tafsilotlar
- `bun add diff @types/diff` — diff hisoblash uchun
- Edge funksiyalar `consume_credits` natijasini `ok: false` bo'lsa 402 status bilan rad etadi
- BuildForge full-stack rejimi uchun ai-assistant ichida yangi `mode: "buildforge"` parametri
- Terminal sandboxed iframe har run uchun yangidan yaratiladi, eski faqat eval o'chiriladi
- Hech qanday mavjud funksiya buzilmaydi: editor, explorer, chat, run-code, preview, kreditlar barchasi ishlaydi
- Tugagach `lovable-exec` orqali build/lint tekshirish
