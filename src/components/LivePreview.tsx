import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Eye, RefreshCw, ExternalLink, Smartphone, Monitor, Tablet, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildPreviewHtml } from "@/lib/live-preview";
import { SandpackProvider, SandpackPreview, useSandpack } from "@codesandbox/sandpack-react";
import { fixExportImportMismatches, type GeneratedProjectFile } from "@/lib/ai-json";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) ?? "";

interface FileItem {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  is_folder: boolean;
}

interface LivePreviewProps {
  files: FileItem[];
  activeFile: FileItem | null;
  isOpen: boolean;
  onToggle: () => void;
}

type ViewportSize = "mobile" | "tablet" | "desktop";

const viewportSizes: Record<ViewportSize, { width: string; label: string; icon: LucideIcon }> = {
  mobile: { width: "375px", label: "Mobile", icon: Smartphone },
  tablet: { width: "768px", label: "Tablet", icon: Tablet },
  desktop: { width: "100%", label: "Desktop", icon: Monitor },
};

// ── Detect project type ───────────────────────────────────────────────────────
const isReactProject = (files: FileItem[]) =>
  files.some(f => !f.is_folder && /\.(tsx|jsx)$/i.test(f.name));

// ── Convert FileItem[] → Sandpack { "/path": content } ───────────────────────
const toSandpackFiles = (files: FileItem[]): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const f of files) {
    if (f.is_folder) continue;
    const raw = `${f.path}${f.name}`.replace(/\/+/g, "/");
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    result[path] = f.content;
  }
  return result;
};

// ── Find React entry point ────────────────────────────────────────────────────
const inferEntry = (fileMap: Record<string, string>): string | null =>
  ["/src/main.tsx", "/src/main.jsx", "/src/index.tsx", "/src/index.jsx", "/main.tsx", "/main.jsx"]
    .find(c => fileMap[c]) ?? null;

// ── Extract npm deps from package.json + import scans ────────────────────────
const extractDeps = (files: FileItem[]): Record<string, string> => {
  const deps: Record<string, string> = {};

  const pkgFile = files.find(f => !f.is_folder && f.name === "package.json");
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      for (const [name, ver] of Object.entries(declared)) {
        deps[name] = String(ver).replace(/^[\^~>=<]+/, "") || "latest";
      }
    } catch { /* invalid JSON */ }
  }

  const importRe = /\bfrom\s+["']([^"']+?)["']|\bimport\s+["']([^"']+?)["']/g;
  for (const f of files) {
    if (f.is_folder || !/\.(tsx?|jsx?)$/.test(f.name)) continue;
    for (const m of f.content.matchAll(importRe)) {
      const specifier = m[1] ?? m[2];
      if (!specifier) continue;
      if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
      const name = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (name && !deps[name]) deps[name] = "latest";
    }
  }

  // Remove build-time / template builtins — these are NOT runtime deps in Sandpack
  const EXCLUDED = new Set([
    "react", "react-dom", "react-scripts", "typescript", "vite",
    "tailwindcss", "postcss", "autoprefixer", "esbuild", "rollup",
    "webpack", "babel", "eslint", "prettier",
  ]);
  for (const name of Object.keys(deps)) {
    if (EXCLUDED.has(name) || name.startsWith("@types/")) delete deps[name];
  }
  return deps;
};

// ── HTML / CSS fallbacks ──────────────────────────────────────────────────────
const FALLBACK_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

const BASE_CSS = `*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }
`;

// ── Core Sandpack patches ─────────────────────────────────────────────────────
const patchSandpackFiles = (files: Record<string, string>): Record<string, string> => {
  const result = { ...files };

  // Normalize /index.html → /public/index.html
  if (!result["/public/index.html"] && result["/index.html"]) {
    result["/public/index.html"] = result["/index.html"];
    delete result["/index.html"];
  }
  if (!result["/public/index.html"]) {
    result["/public/index.html"] = FALLBACK_INDEX_HTML;
  }
  // Ensure <div id="root"> exists in index.html
  if (!result["/public/index.html"].includes('id="root"')) {
    result["/public/index.html"] = result["/public/index.html"].replace(
      "</body>",
      '  <div id="root"></div>\n</body>'
    );
  }

  // Strip @tailwind directives (PostCSS build-time only; twind/shim replaces them)
  for (const [path, content] of Object.entries(result)) {
    if (path.endsWith(".css") && content.includes("@tailwind")) {
      const stripped = content.replace(/@tailwind\s+\w+;?\s*\n?/g, "").trim();
      result[path] = stripped || BASE_CSS;
    }
  }

  // Ensure CSS entry exists
  const cssKey =
    ["/src/index.css", "/src/styles.css", "/src/global.css"].find(k => k in result) ??
    "/src/index.css";
  if (!result[cssKey]) result[cssKey] = BASE_CSS;

  // Patch main.tsx: inject twind/shim + CSS import
  const mainKey =
    "/src/main.tsx" in result ? "/src/main.tsx" :
    "/src/index.tsx" in result ? "/src/index.tsx" : null;
  if (mainKey) {
    let src = result[mainKey];
    const cssBasename = cssKey.split("/").pop()!;
    if (!src.includes(cssBasename)) {
      src = `import '${cssKey.replace("/src/", "./")}'; \n` + src;
    }
    if (!src.includes("twind")) {
      src = `import 'twind/shim';\n` + src;
    }
    result[mainKey] = src;
  }

  return result;
};

// ═══════════════════════════════════════════════════════════════════
//  GOAL 2A — Pre-preview auto-fixes
// ═══════════════════════════════════════════════════════════════════

// Create a minimal valid stub for a missing file so Sandpack never
// crashes with "Could not find module './X'" for local imports.
const createMinimalStub = (filePath: string): string => {
  const ext = (filePath.split(".").pop() ?? "").toLowerCase();
  const rawName = (filePath.split("/").pop() ?? "Component").replace(/\.(tsx?|jsx?)$/, "");
  const compName =
    (rawName.charAt(0).toUpperCase() + rawName.slice(1)).replace(/[^a-zA-Z0-9]/g, "") ||
    "Stub";

  if (/tsx|jsx/.test(ext)) {
    return (
      `const ${compName} = () => (\n` +
      `  <div style={{padding:'8px',fontSize:12,color:'#888',border:'1px dashed #444',borderRadius:4}}>` +
      `${compName} (stub)</div>\n` +
      `);\nexport default ${compName};\n`
    );
  }
  // Plain TS/JS utility stub
  return `export const ${compName} = {};\nexport default ${compName};\n`;
};

// Resolve a relative import specifier to an absolute path.
const resolveRelative = (fromFile: string, spec: string): string => {
  const dir = fromFile.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") { dir.pop(); continue; }
    dir.push(seg);
  }
  return "/" + dir.filter(Boolean).join("/");
};

// Scan every file for unresolved local imports and inject stubs.
// Runs up to 3 passes to handle transitive stubs (A imports B which imports C).
const addMissingStubs = (files: Record<string, string>): Record<string, string> => {
  let result = { ...files };
  const exts = [".tsx", ".ts", ".jsx", ".js"];

  for (let pass = 0; pass < 3; pass++) {
    const known = new Set(Object.keys(result));
    let added = false;

    for (const [filePath, content] of Object.entries(result)) {
      const importRe = /(?:from|import)\s+["'](\.[^"']+?)["']/g;
      for (const m of content.matchAll(importRe)) {
        const spec = m[1];
        const resolved = resolveRelative(filePath, spec);
        const candidates = [
          resolved,
          ...exts.map(e => resolved + e),
          resolved + "/index.tsx",
          resolved + "/index.ts",
        ];
        if (candidates.some(c => known.has(c))) continue;

        const stubPath = resolved + ".tsx";
        if (!result[stubPath]) {
          result[stubPath] = createMinimalStub(stubPath);
          added = true;
        }
      }
    }

    if (!added) break;
  }

  return result;
};

// Re-use the existing ai-json mismatch fixer (default vs named export).
// This prevents "Element type is invalid: got undefined" crashes.
const applyExportImportFix = (files: Record<string, string>): Record<string, string> => {
  const projectFiles: GeneratedProjectFile[] = Object.entries(files).map(([fullPath, content]) => {
    const parts = fullPath.split("/").filter(Boolean);
    const name = parts.pop() ?? "";
    const path = "/" + (parts.length > 0 ? parts.join("/") + "/" : "");
    return { name, path, content, language: "tsx", is_folder: false };
  });

  const fixed = fixExportImportMismatches(projectFiles);

  const result: Record<string, string> = {};
  for (const f of fixed) {
    const key = `${f.path}${f.name}`.replace(/\/+/g, "/");
    result[key.startsWith("/") ? key : `/${key}`] = f.content;
  }
  return result;
};

// Extract missing npm package name from a bundler error message.
const extractMissingPackage = (errorMsg: string): string | null => {
  const patterns = [
    /Could not find dependency:\s*['"]([^'"]+)['"]/i,
    /Cannot find module\s+['"]([^.'"\/][^'"]*)['"]/i,
    /Module not found.*Error.*\s['"]([^.'"\/][^'"]*)['"]/i,
    /failed to resolve.*['"]([^.'"\/][^'"]*)['"]/i,
  ];
  for (const re of patterns) {
    const m = errorMsg.match(re);
    if (m?.[1]) {
      const spec = m[1];
      const name = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")
        : spec.split("/")[0];
      // Don't try to add obvious non-package strings
      if (name && name.length > 1 && !/^\d/.test(name)) return name;
    }
  }
  return null;
};

// ── GOAL 3: Detect React hook called at module top level ────────────────────
// A line that starts at column 0 (no leading whitespace) and directly assigns
// the return value of a use*() hook to a variable is a top-level hook call.
// Example violation:  export const dirtTexture = useTexture(dirtImg)
// This would crash with "Cannot read properties of null (reading 'useContext')".
interface HookViolation {
  file: string;
  hook: string;
  line: string;
}

const detectTopLevelHookCalls = (
  files: Record<string, string>
): HookViolation | null => {
  // Matches lines that start at column 0 (no leading whitespace) and assign a
  // hook call result to a variable. Indented lines (inside functions) won't match.
  const re = /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(use[A-Z][a-zA-Z0-9]*)\s*\(/m;
  for (const [filePath, content] of Object.entries(files)) {
    if (!/\.(tsx?|jsx?)$/.test(filePath)) continue;
    const m = content.match(re);
    if (!m) continue;
    // Find the actual line text for display
    const charsBefore = content.slice(0, m.index ?? 0);
    const lineIdx = charsBefore.split("\n").length - 1;
    const lineText = content.split("\n")[lineIdx]?.trim() ?? m[0].trim();
    return { file: filePath, hook: m[1], line: lineText };
  }
  return null;
};

// ═══════════════════════════════════════════════════════════════════
//  GOAL 2C — Self-heal: call AI to fix runtime/compile errors
// ═══════════════════════════════════════════════════════════════════
const autoFixWithAI = async (
  errorMsg: string,
  fileContents: Record<string, string>
): Promise<Record<string, string> | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const relevantFiles = Object.entries(fileContents)
      .filter(([p]) => /\.(tsx?|jsx?)$/.test(p))
      .slice(0, 7)
      .map(([p, c]) => `// === ${p} ===\n${c.slice(0, 800)}`)
      .join("\n\n---\n\n")
      .slice(0, 5500);

    const prompt =
      `Fix this React/TypeScript project. A runtime error occurred in the Sandpack preview.\n\n` +
      `ERROR:\n${errorMsg}\n\n` +
      `PROJECT FILES (truncated):\n${relevantFiles}\n\n` +
      `Output ONLY the fixed files using:\n` +
      `[CHANGE_FILE: /path/file.tsx]\n\`\`\`tsx\n...fixed content...\n\`\`\`\n` +
      `[NEW_FILE: /path/file.tsx]\n\`\`\`tsx\n...content...\n\`\`\`\n` +
      `Fix ONLY what's broken. No explanations.`;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        prompt,
        code: "",
        language: "tsx",
        mode: "buildforge-chat",
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as { response?: string };
    const text = data.response ?? "";

    const fixes: Record<string, string> = {};
    const re = /\[(?:CHANGE_FILE|NEW_FILE):\s*([^\],]+)[^\]]*\]\s*\n```(?:\w+)?\n([\s\S]*?)```/g;
    for (const m of text.matchAll(re)) {
      const p = m[1].trim();
      fixes[p.startsWith("/") ? p : `/${p}`] = m[2].trim();
    }
    return Object.keys(fixes).length > 0 ? fixes : null;
  } catch {
    return null;
  }
};

// ═══════════════════════════════════════════════════════════════════
//  GOAL 2B — Error watcher (must be inside SandpackProvider)
// ═══════════════════════════════════════════════════════════════════
const SandpackErrorWatcher = ({
  onError,
}: {
  onError: (msg: string) => void;
}) => {
  const { sandpack } = useSandpack();

  useEffect(() => {
    if (!sandpack.error) return;
    const err = sandpack.error as { message?: string; title?: string };
    const msg = err.message || err.title || JSON.stringify(sandpack.error);
    onError(msg);
  }, [sandpack.error, onError]);

  return null;
};

// ═══════════════════════════════════════════════════════════════════
//  Sandpack-based React preview (core component)
// ═══════════════════════════════════════════════════════════════════
const SandpackReactPreview = ({ files }: { files: FileItem[] }) => {
  const [sandpackError, setSandpackError] = useState<string | null>(null);
  const [autoFixing, setAutoFixing] = useState(false);
  const [fixAttempted, setFixAttempted] = useState(false);
  const [extraDeps, setExtraDeps] = useState<Record<string, string>>({});
  const [extraFiles, setExtraFiles] = useState<Record<string, string>>({});
  const [providerKey, setProviderKey] = useState(0);
  // When true, user chose to bypass the hook-violation warning and try Sandpack anyway
  const [bypassHookCheck, setBypassHookCheck] = useState(false);
  const triedPkgs = useRef<Set<string>>(new Set());

  // ── 2A: Full pre-fix pass before handing to Sandpack ──────────────────────
  const patchedFiles = useMemo(() => {
    let f = toSandpackFiles(files);
    f = patchSandpackFiles(f);
    f = applyExportImportFix(f);
    f = addMissingStubs(f);
    return { ...f, ...extraFiles };
  }, [files, extraFiles]);

  const entry = useMemo(() => inferEntry(patchedFiles), [patchedFiles]);

  const deps = useMemo(() => {
    const base = extractDeps(files);
    base["twind"] = "^0.16.16";
    return { ...base, ...extraDeps };
  }, [files, extraDeps]);

  // ── GOAL 3: detect top-level hook violation before mounting Sandpack ───────
  const hookViolation = useMemo(
    () => (bypassHookCheck ? null : detectTopLevelHookCalls(patchedFiles)),
    [patchedFiles, bypassHookCheck]
  );

  // The error shown in the overlay: hook violation takes priority over runtime error
  const activeError: string | null = hookViolation
    ? `React Hooks qoidasi buzildi!\n\n` +
      `"${hookViolation.hook}" hook moduli yuqori darajasida (top-level) chaqirilgan:\n` +
      `  ${hookViolation.file}\n\n` +
      `Muammo qator:\n  ${hookViolation.line}\n\n` +
      `Hooklar FAQAT React komponenti yoki custom hook ichida ishlaydi.\n` +
      `Yechiм: useTexture/useLoader ni komponent funksiyasi ichiga ko'chiring.`
    : sandpackError;

  // ── Error handler: auto-fix missing npm packages immediately ──────────────
  const handleSandpackError = useCallback((msg: string) => {
    setSandpackError(msg);
    const missingPkg = extractMissingPackage(msg);
    if (missingPkg && !triedPkgs.current.has(missingPkg)) {
      triedPkgs.current.add(missingPkg);
      setExtraDeps(prev => ({ ...prev, [missingPkg]: "latest" }));
      setTimeout(() => {
        setSandpackError(null);
        setProviderKey(k => k + 1);
      }, 350);
    }
  }, []);

  // ── Retry: for hook violation → bypass check; for runtime error → remount ─
  const handleRetry = useCallback(() => {
    if (hookViolation) {
      setBypassHookCheck(true);
    } else {
      setSandpackError(null);
      setFixAttempted(false);
      setProviderKey(k => k + 1);
    }
  }, [hookViolation]);

  // ── AI self-heal ───────────────────────────────────────────────────────────
  const handleAutoFix = useCallback(async () => {
    if (fixAttempted || !activeError || autoFixing) return;
    setFixAttempted(true);
    setAutoFixing(true);
    try {
      const fixes = await autoFixWithAI(activeError, patchedFiles);
      if (fixes) {
        setExtraFiles(prev => ({ ...prev, ...fixes }));
        setSandpackError(null);
        setBypassHookCheck(false); // re-check the AI-fixed files
        setTimeout(() => setProviderKey(k => k + 1), 150);
      }
    } finally {
      setAutoFixing(false);
    }
  }, [fixAttempted, activeError, autoFixing, patchedFiles]);

  // ── No entry point ─────────────────────────────────────────────────────────
  if (!entry) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3 p-6">
        <Eye className="h-8 w-8 text-muted-foreground/35" />
        <p className="text-xs text-muted-foreground/60 font-medium">Entry point topilmadi</p>
        <p className="text-[11px] text-muted-foreground/40">
          Loyihaga{" "}
          <code className="bg-muted/40 px-1 rounded">src/main.tsx</code> qo'shing
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        minHeight: 0,
        position: "relative",
      }}
    >
      {/* Sandpack layout overrides */}
      <style>{`
        .sp-wrapper { flex: 1 !important; display: flex !important; flex-direction: column !important; height: auto !important; min-height: 0 !important; }
        .sp-preview-container { flex: 1 !important; height: auto !important; min-height: 0 !important; }
        .sp-preview-iframe { flex: 1 !important; height: 100% !important; border: none !important; width: 100% !important; min-height: 0 !important; }
        .sp-overlay { display: none !important; }
        .sp-error-overlay { display: none !important; }
      `}</style>

      {/* Mount Sandpack only when no unresolved hook violation */}
      {!hookViolation && (
        <SandpackProvider
          key={providerKey}
          template="react-ts"
          files={patchedFiles}
          customSetup={{ entry, dependencies: deps }}
          theme="dark"
          options={{ recompileMode: "delayed", recompileDelay: 500 }}
        >
          <SandpackErrorWatcher onError={handleSandpackError} />
          <SandpackPreview
            style={{ flex: 1, height: "auto", width: "100%", minHeight: 0 }}
            showNavigator={false}
            showRefreshButton={false}
            showOpenInCodeSandbox={false}
          />
        </SandpackProvider>
      )}

      {/* Error overlay — shows for hook violations AND runtime Sandpack errors */}
      {activeError && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(8,8,18,0.97)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px 20px",
            zIndex: 30,
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          }}
        >
          <div style={{ maxWidth: 500, width: "100%" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span style={{ color: "#f87171", fontWeight: 700, fontSize: 13 }}>
                {hookViolation ? "React Hooks qoidasi buzildi:" : "Preview'da xato:"}
              </span>
            </div>
            <pre
              style={{
                background: "#0f0f1c",
                color: "#fca5a5",
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 11,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                border: "1px solid rgba(239,68,68,0.22)",
                maxHeight: 220,
                overflowY: "auto",
                marginBottom: 14,
                lineHeight: 1.65,
              }}
            >
              {activeError}
            </pre>
            {hookViolation && (
              <p style={{ fontSize: 11, color: "#60a5fa", marginBottom: 12, lineHeight: 1.5 }}>
                💡 useTexture, useLoader va boshqa hooklar faqat komponent ichida ishlaydi.
                Ularni mesh komponentiga ko'chiring yoki custom hook yarating.
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={handleRetry}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  background: "#7c3aed",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {hookViolation ? "Baribir sinab ko'r" : "Qayta urinish"}
              </button>

              {!fixAttempted && SUPABASE_URL && (
                <button
                  onClick={handleAutoFix}
                  disabled={autoFixing}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 6,
                    background: autoFixing ? "#1a1a2e" : "#064e3b",
                    color: autoFixing ? "#4b5563" : "#6ee7b7",
                    border: "1px solid rgba(52,211,153,0.28)",
                    cursor: autoFixing ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    transition: "all 0.15s",
                  }}
                >
                  {autoFixing ? "⏳ AI tuzatmoqda..." : "✨ AI bilan tuzatish"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Legacy iframe preview for plain HTML/JS projects ─────────────────────────
const IframePreview = ({ files }: { files: FileItem[] }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const cleanupUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const buildPreview = useCallback(() => {
    const htmlContent = buildPreviewHtml(files);
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    cleanupUrl();
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }, [files, cleanupUrl]);

  useEffect(() => {
    buildPreview();
    return cleanupUrl;
  }, [buildPreview, cleanupUrl]);

  return (
    <iframe
      ref={iframeRef}
      src={previewUrl}
      className="w-full h-full border-0"
      title="Live Preview"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    />
  );
};

// ── Main LivePreview component ────────────────────────────────────────────────
const LivePreview = ({ files, isOpen, onToggle }: LivePreviewProps) => {
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [refreshKey, setRefreshKey] = useState(0);

  const react = isReactProject(files);
  const hasPreviewable = files.some(
    f => /\.(html|tsx|ts|jsx|js)$/.test(f.name) && !f.is_folder
  );

  const openExternal = () => {
    if (!react) {
      const htmlContent = buildPreviewHtml(files);
      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Toolbar */}
      <div className="h-9 flex items-center justify-between px-2 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-1">
          <Eye className="h-3.5 w-3.5 text-primary mr-1" />
          <span className="text-[11px] font-medium text-muted-foreground">Preview</span>
          {react && (
            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary/70">
              Sandpack
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {(Object.keys(viewportSizes) as ViewportSize[]).map(size => {
            const { icon: Icon, label } = viewportSizes[size];
            return (
              <button
                key={size}
                onClick={() => setViewport(size)}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  viewport === size
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                title={label}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {!react && (
            <button
              onClick={openExternal}
              className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onToggle}
            className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Close preview"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
          background: "#0a0a0f",
        }}
      >
        {hasPreviewable ? (
          viewport === "desktop" ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              {react ? (
                <SandpackReactPreview key={refreshKey} files={files} />
              ) : (
                <IframePreview key={refreshKey} files={files} />
              )}
            </div>
          ) : (
            <div className="flex-1 flex justify-center items-start overflow-auto p-3">
              <div
                className="bg-background rounded-lg overflow-hidden shadow-xl border border-border/30 h-full flex-shrink-0"
                style={{ width: viewportSizes[viewport].width }}
              >
                {react ? (
                  <SandpackReactPreview key={refreshKey} files={files} />
                ) : (
                  <IframePreview key={refreshKey} files={files} />
                )}
              </div>
            </div>
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-muted/20 flex items-center justify-center">
              <Eye className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">Previewlanadigan fayl yo'q</p>
            <p className="text-xs text-muted-foreground/70">
              HTML yoki TSX fayl yarating
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LivePreview;