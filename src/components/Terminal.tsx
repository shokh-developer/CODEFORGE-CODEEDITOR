import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Trash2, Terminal as TerminalIcon, ChevronUp, ChevronDown, Loader2, Keyboard, Eye, Code2, Maximize2, Minimize2, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface FileItem {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  is_folder: boolean;
}

interface TerminalProps {
  isOpen: boolean;
  onToggle: () => void;
  code: string;
  language: string;
  files?: FileItem[];
  activeFile?: FileItem | null;
}

interface LogEntry {
  type: "log" | "error" | "warn" | "info" | "result" | "compile";
  content: string;
  timestamp: Date;
}

const webLanguages = ["html", "css", "javascript", "jsx", "tsx", "typescript"];
const browserRenderLanguages = ["html", "css", "javascript", "jsx", "tsx"];
const backendLanguages = ["javascript", "typescript", "python", "cpp", "c", "java", "go", "rust", "php", "ruby", "csharp", "swift", "kotlin", "dart", "lua", "perl", "r", "scala", "bash", "sql"];
const inputLanguages = ["cpp", "c", "python", "java", "go", "rust", "csharp", "kotlin", "dart", "swift"];

const getLanguageFromExt = (ext: string): string => {
  const map: Record<string, string> = {
    js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx",
    html: "html", css: "css", py: "python", cpp: "cpp", c: "c",
    java: "java", go: "go", rs: "rust", php: "php", rb: "ruby",
    cs: "csharp", swift: "swift", kt: "kotlin", dart: "dart",
    lua: "lua", pl: "perl", r: "r", scala: "scala", sh: "bash", sql: "sql",
  };
  return map[ext] || "plaintext";
};

const Terminal = ({ isOpen, onToggle, code, language: rawLanguage, files, activeFile }: TerminalProps) => {
  // Detect real language from file extension if stored as plaintext
  const language = (() => {
    if (rawLanguage && rawLanguage !== "plaintext") return rawLanguage;
    if (activeFile?.name) {
      const ext = activeFile.name.split('.').pop()?.toLowerCase() || '';
      const detected = getLanguageFromExt(ext);
      if (detected !== "plaintext") return detected;
    }
    return rawLanguage;
  })();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showInputDialog, setShowInputDialog] = useState(false);
  const [stdinInput, setStdinInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Convert previewHtml to blob URL for reliable rendering
  useEffect(() => {
    if (previewHtml) {
      const blob = new Blob([previewHtml], { type: 'text/html; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl("");
    }
  }, [previewHtml]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const clearLogs = () => setLogs([]);

  const addLog = (type: LogEntry["type"], content: string) => {
    setLogs((prev) => [...prev, { type, content, timestamp: new Date() }]);
  };

  const codeNeedsInput = () => {
    if (language === "cpp" || language === "c") return /\b(cin|scanf|gets|getline|getchar)\b/.test(code);
    if (language === "python") return /\binput\s*\(/.test(code);
    if (language === "java") return /\bScanner\b/.test(code);
    return false;
  };

  const gatherWebFiles = () => {
    if (!files) return { htmlFiles: [], cssFiles: [], jsFiles: [], tsxFiles: [] };
    const currentPath = activeFile?.path || "/";
    const htmlFiles: FileItem[] = [];
    const cssFiles: FileItem[] = [];
    const jsFiles: FileItem[] = [];
    const tsxFiles: FileItem[] = [];

    files.forEach(file => {
      if (file.is_folder) return;
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'html') htmlFiles.push(file);
      else if (ext === 'css' || ext === 'scss') cssFiles.push(file);
      else if (ext === 'js') jsFiles.push(file);
      else if (ext === 'jsx' || ext === 'tsx' || ext === 'ts') tsxFiles.push(file);
    });

    const sortByPath = (a: FileItem, b: FileItem) => {
      if (a.path === currentPath && b.path !== currentPath) return -1;
      if (b.path === currentPath && a.path !== currentPath) return 1;
      return 0;
    };

    return {
      htmlFiles: htmlFiles.sort(sortByPath),
      cssFiles: cssFiles.sort(sortByPath),
      jsFiles: jsFiles.sort(sortByPath),
      tsxFiles: tsxFiles.sort(sortByPath),
    };
  };

  const buildWebPreview = (): string => {
    const { htmlFiles, cssFiles, jsFiles, tsxFiles } = gatherWebFiles();
    const allCss = cssFiles.map(f => f.content).join('\n');
    const allJs = jsFiles.map(f => f.content).join('\n');
    const hasTsx = tsxFiles.length > 0 || language === 'tsx' || language === 'jsx';
    const allTsx = tsxFiles.map(f => f.content).join('\n');
    const allCode = [code, allCss, allJs, allTsx, ...htmlFiles.map(f => f.content)].join('\n');

    let mainHtml = '';
    if (language === 'html') {
      mainHtml = code;
    } else {
      const htmlFile = htmlFiles.find(f => f.path === (activeFile?.path || '/')) || htmlFiles[0];
      mainHtml = htmlFile?.content || '';
    }

    if (mainHtml) {
      let result = mainHtml;
      
      // Check if HTML uses module scripts (Vite/React project) - render as-is without injecting other files
      const hasModuleScript = /&lt;script\s[^>]*type\s*=\s*["']module["']/i.test(result) || /<script\s[^>]*type\s*=\s*["']module["']/i.test(result);
      
      if (hasModuleScript) {
        // Strip the module script tags since they won't resolve in blob URL
        result = result.replace(/<script\s[^>]*type\s*=\s*["']module["'][^>]*>[\s\S]*?<\/script>/gi, '');
        // Add a simple message in body
        const msg = `<div style="padding:40px;font-family:Inter,system-ui,sans-serif;text-align:center;color:#94a3b8">
          <h2 style="color:#e2e8f0;margin-bottom:12px">CODEFORGE</h2>
          <p>Bu fayl Vite/React loyihasi uchun. Mustaqil HTML sahifa yarating preview ko'rish uchun.</p>
          <p style="margin-top:8px;font-size:13px;opacity:0.7">Masalan: &lt;h1&gt;Hello World&lt;/h1&gt; yozing</p>
        </div>`;
        if (result.includes('<body>')) result = result.replace('<body>', `<body>${msg}`);
        else if (result.includes('</body>')) result = result.replace('</body>', `${msg}</body>`);
        return wrapWithPreviewShell(result, allCode);
      }
      
      if (allCss) {
        const cssTag = `<style>\n${allCss}\n</style>`;
        if (result.includes('</head>')) result = result.replace('</head>', `${cssTag}\n</head>`);
        else if (result.includes('<body')) result = result.replace('<body', `${cssTag}\n<body`);
        else result = cssTag + '\n' + result;
      }
      if (language === 'css') {
        const currentCssTag = `<style>\n${code}\n</style>`;
        if (result.includes('</head>')) result = result.replace('</head>', `${currentCssTag}\n</head>`);
        else result = currentCssTag + '\n' + result;
      }
      const jsCode = language === 'javascript' ? code + '\n' + allJs : allJs;
      if (jsCode.trim()) {
        const jsTag = `<script>\ntry {\n${jsCode}\n} catch(e) { console.error(e); }\n<\/script>`;
        if (result.includes('</body>')) result = result.replace('</body>', `${jsTag}\n</body>`);
        else result += '\n' + jsTag;
      }
      if (hasTsx) {
        const tsxCode = (language === 'tsx' || language === 'jsx') ? code : allTsx;
        if (tsxCode.trim()) result = injectReactSupport(result, tsxCode);
      }
      return wrapWithPreviewShell(result, allCode);
    }

    if (language === 'css') {
      return wrapWithPreviewShell(`<!DOCTYPE html><html><head><style>${allCss}\n${code}</style></head>
<body><div style="padding:24px"><h1>CSS Preview</h1><p>Create an HTML file.</p>
<div style="width:100px;height:100px;background:var(--accent-color, #6366f1);border-radius:12px;margin:16px 0"></div>
<button style="padding:10px 20px;border-radius:8px;border:none;background:var(--accent-color, #6366f1);color:white;cursor:pointer;font-weight:500">Button</button>
</div></body></html>`, allCode);
    }

    if (language === 'javascript') {
      return wrapWithPreviewShell(`<!DOCTYPE html><html><head><style>${allCss}</style></head><body>
<div id="app"></div><div id="root"></div><div id="output" style="padding:16px"></div>
<script>
const _output = document.getElementById('output');
const _origLog = console.log;
console.log = function(...args) {
  _origLog.apply(console, args);
  const p = document.createElement('pre');
  p.style.cssText = 'color:#4ade80;margin:4px 0;font-family:monospace;font-size:13px;line-height:1.5;';
  p.textContent = args.map(a => typeof a === 'object' ? JSON.stringify(a,null,2) : String(a)).join(' ');
  _output.appendChild(p);
};
console.error = function(...args) {
  const p = document.createElement('pre');
  p.style.cssText = 'color:#f87171;margin:4px 0;font-family:monospace;font-size:13px;';
  p.textContent = args.map(a => String(a)).join(' ');
  _output.appendChild(p);
};
try { ${code} } catch(e) { console.error(e.message); }
<\/script></body></html>`, allCode);
    }

    if (language === 'tsx' || language === 'jsx') {
      return wrapWithPreviewShell(buildTsxPreview(code, allCss), allCode);
    }

    return '';
  };

  const buildTsxPreview = (tsxCode: string, css: string): string => {
    return `<!DOCTYPE html>
<html><head>
<style>${css}</style>
<script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin><\/script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>
</head><body>
<div id="root"></div>
<script type="text/babel" data-presets="react,typescript">
${tsxCode}

try {
  const _rootEl = document.getElementById('root');
  const _root = ReactDOM.createRoot(_rootEl);
  if (typeof App !== 'undefined') _root.render(React.createElement(App));
  else if (typeof Main !== 'undefined') _root.render(React.createElement(Main));
  else if (typeof Home !== 'undefined') _root.render(React.createElement(Home));
  else if (typeof Component !== 'undefined') _root.render(React.createElement(Component));
  else if (typeof Page !== 'undefined') _root.render(React.createElement(Page));
} catch(e) {
  document.getElementById('root').innerHTML = '<pre style="color:#f87171;padding:16px">' + e.message + '</pre>';
}
<\/script></body></html>`;
  };

  const injectReactSupport = (html: string, tsxCode: string): string => {
    const reactScripts = `
<script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin><\/script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>`;
    const tsxTag = `<script type="text/babel" data-presets="react,typescript">
${tsxCode}
try {
  const _rootEl = document.getElementById('root') || document.getElementById('app');
  if (_rootEl) {
    const _root = ReactDOM.createRoot(_rootEl);
    if (typeof App !== 'undefined') _root.render(React.createElement(App));
    else if (typeof Main !== 'undefined') _root.render(React.createElement(Main));
    else if (typeof Component !== 'undefined') _root.render(React.createElement(Component));
  }
} catch(e) { console.error(e); }
<\/script>`;

    if (html.includes('</head>')) html = html.replace('</head>', `${reactScripts}\n</head>`);
    else html = reactScripts + '\n' + html;
    if (html.includes('</body>')) html = html.replace('</body>', `${tsxTag}\n</body>`);
    else html += '\n' + tsxTag;
    return html;
  };

  const detectUsedLibraries = (allCode: string): string => {
    const libs: string[] = [];
    libs.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
    libs.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
    libs.push('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Fira+Code:wght@400;500;700&display=swap" rel="stylesheet">');
    
    if (/fa-|font-awesome|fas |fab |far /i.test(allCode))
      libs.push('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">');
    if (/class=".*\b(container|row|col-|btn |btn-|navbar|modal|card |carousel)/i.test(allCode) || /bootstrap/i.test(allCode)) {
      libs.push('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">');
      libs.push('<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"><\/script>');
    }
    if (/class=".*\b(flex |grid |bg-|text-|p-|m-|w-|h-|rounded|shadow|border)/i.test(allCode) || /tailwind/i.test(allCode))
      libs.push('<script src="https://cdn.tailwindcss.com"><\/script>');
    if (/animate__/i.test(allCode))
      libs.push('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">');
    if (/\bAOS\b|data-aos/i.test(allCode)) {
      libs.push('<link href="https://unpkg.com/aos@2.3.4/dist/aos.css" rel="stylesheet">');
      libs.push('<script src="https://unpkg.com/aos@2.3.4/dist/aos.js"><\/script>');
    }
    if (/\$\(|jQuery/i.test(allCode))
      libs.push('<script src="https://code.jquery.com/jquery-3.7.1.min.js"><\/script>');
    if (/\bgsap\b|TweenMax|TimelineMax|ScrollTrigger/i.test(allCode)) {
      libs.push('<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"><\/script>');
      libs.push('<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"><\/script>');
    }
    if (/\banime\b\(/i.test(allCode))
      libs.push('<script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js"><\/script>');
    if (/THREE\.|three\.js/i.test(allCode))
      libs.push('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js"><\/script>');
    if (/\bChart\b|new Chart/i.test(allCode))
      libs.push('<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"><\/script>');
    if (/\b_\.\w+|lodash/i.test(allCode))
      libs.push('<script src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js"><\/script>');
    if (/\baxios\b/i.test(allCode))
      libs.push('<script src="https://cdn.jsdelivr.net/npm/axios@1.6.7/dist/axios.min.js"><\/script>');
    if (/\bSwal\b|sweetalert/i.test(allCode))
      libs.push('<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"><\/script>');
    if (/\bTyped\b/i.test(allCode))
      libs.push('<script src="https://unpkg.com/typed.js@2.1.0/dist/typed.umd.js"><\/script>');
    if (/particlesJS|particles\.js/i.test(allCode))
      libs.push('<script src="https://cdn.jsdelivr.net/npm/particles.js@2.0.0/particles.min.js"><\/script>');
    if (/\bSwiper\b/i.test(allCode)) {
      libs.push('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">');
      libs.push('<script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"><\/script>');
    }
    if (/ScrollReveal/i.test(allCode))
      libs.push('<script src="https://unpkg.com/scrollreveal@4.0.9/dist/scrollreveal.min.js"><\/script>');
    if (/\bVue\b|createApp|v-if|v-for/i.test(allCode))
      libs.push('<script src="https://unpkg.com/vue@3/dist/vue.global.js"><\/script>');
    if (/x-data|x-show|x-bind|Alpine/i.test(allCode))
      libs.push('<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"><\/script>');
    return libs.join('\n');
  };

  const wrapWithPreviewShell = (html: string, allCode?: string): string => {
    const baseStyle = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
html, body { 
  margin: 0; padding: 0; 
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
</style>`;
    const libs = detectUsedLibraries(allCode || html);
    const headContent = baseStyle + '\n' + libs;
    
    // Strip any existing doctype/html wrappers to avoid nesting
    let bodyContent = html;
    if (html.includes('<head>') || html.includes('<!DOCTYPE') || html.includes('<html')) {
      // Already has structure, just inject into head
      if (html.includes('<head>')) {
        return html.replace('<head>', `<head>\n${headContent}`);
      } else if (html.includes('<!DOCTYPE') || html.includes('<html')) {
        return html.replace(/(<html[^>]*>)/i, `$1<head>${headContent}</head>`);
      }
    }
    return `<!DOCTYPE html><html><head>${headContent}</head><body>${bodyContent}</body></html>`;
  };

  const runWebPreview = () => {
    const html = buildWebPreview();
    if (!html) {
      addLog("error", "Could not generate preview. Create an HTML file.");
      return;
    }
    const { cssFiles, jsFiles, tsxFiles } = gatherWebFiles();
    addLog("info", "Starting web preview...");
    if (cssFiles.length > 0) addLog("info", `CSS: ${cssFiles.map(f => f.name).join(', ')}`);
    if (jsFiles.length > 0) addLog("info", `JS: ${jsFiles.map(f => f.name).join(', ')}`);
    if (tsxFiles.length > 0) addLog("info", `TSX/JSX: ${tsxFiles.map(f => f.name).join(', ')}`);
    setPreviewHtml(html);
    setActiveTab("preview");
    addLog("result", "Preview ready.");
  };

  const runCodeInBrowser = () => {
    try {
      if (browserRenderLanguages.includes(language)) {
        runWebPreview();
        return;
      }
      const customConsole = {
        log: (...args: any[]) => addLog("log", args.map(formatValue).join(" ")),
        error: (...args: any[]) => addLog("error", args.map(formatValue).join(" ")),
        warn: (...args: any[]) => addLog("warn", args.map(formatValue).join(" ")),
        info: (...args: any[]) => addLog("info", args.map(formatValue).join(" ")),
      };
      const sandboxCode = `(function(console) { "use strict"; ${code} })`;
      try {
        const fn = eval(sandboxCode);
        const result = fn(customConsole);
        if (result !== undefined) addLog("result", `↳ ${formatValue(result)}`);
        addLog("info", "Code executed successfully.");
      } catch (err: any) {
        addLog("error", `Error: ${err.message}`);
      }
    } catch (err: any) {
      addLog("error", `Error: ${err.message}`);
    }
  };

  const runCodeOnServer = async (stdin: string = "") => {
    try {
      addLog("info", `Running ${language.toUpperCase()} code on server...`);
      if (stdin) addLog("info", `Input: ${stdin.split('\n').join(', ')}`);

      const { data, error } = await supabase.functions.invoke("run-code", {
        body: { code, language: language === 'tsx' ? 'typescript' : language, stdin },
      });

      if (error) { addLog("error", `Server error: ${error.message}`); return; }
      handleServerResult(data);
    } catch (err: any) {
      addLog("error", `Error: ${err.message}`);
    }
  };

  const runCommandOnServer = async (lang: string, codeToRun: string, stdin: string = "") => {
    try {
      setIsRunning(true);
      const { data, error } = await supabase.functions.invoke("run-code", {
        body: { code: codeToRun, language: lang, stdin },
      });
      if (error) { addLog("error", `Server error: ${error.message}`); return; }
      handleServerResult(data);
    } catch (err: any) {
      addLog("error", `Error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleServerResult = (data: any) => {
    if (!data.success) { addLog("error", `Error: ${data.error}`); return; }
    if (data.compile) {
      if (data.compile.stderr) addLog("compile", `Compilation error:\n${data.compile.stderr}`);
      if (data.compile.stdout) addLog("compile", `Compilation:\n${data.compile.stdout}`);
    }
    if (data.run) {
      if (data.run.stdout) addLog("result", data.run.stdout);
      if (data.run.stderr) addLog("error", data.run.stderr);
      if (data.run.code === 0) addLog("info", `Success! (${data.language} ${data.version})`);
      else if (data.run.code !== undefined) addLog("warn", `Program exited with code ${data.run.code}`);
    }
  };

  const handleRunClick = () => {
    if (inputLanguages.includes(language) && codeNeedsInput()) {
      setShowInputDialog(true);
    } else {
      runCode("");
    }
  };

  const handleRunWithInput = () => {
    setShowInputDialog(false);
    runCode(stdinInput);
    setStdinInput("");
  };

  const runCode = async (stdin: string) => {
    setIsRunning(true);
    clearLogs();
    addLog("info", `Starting ${language.toUpperCase()}...`);

    try {
      if (browserRenderLanguages.includes(language)) {
        runCodeInBrowser();
      } else if (backendLanguages.includes(language)) {
        await runCodeOnServer(stdin);
      } else {
        addLog("error", `${language.toUpperCase()} is not supported.`);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const formatValue = (value: any): string => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "object") { try { return JSON.stringify(value, null, 2); } catch { return String(value); } }
    return String(value);
  };

  const getLogColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "error": return "text-red-400";
      case "warn": return "text-amber-400";
      case "info": return "text-blue-400";
      case "result": return "text-emerald-400";
      case "compile": return "text-violet-400";
      default: return "text-foreground";
    }
  };

  const getLogIcon = (type: LogEntry["type"]) => {
    switch (type) {
      case "error": return "✕";
      case "warn": return "⚠";
      case "info": return "›";
      case "result": return "→";
      case "compile": return "⚙";
      default: return "·";
    }
  };

  const isWebFile = browserRenderLanguages.includes(language);
  const terminalHeight = expanded ? 500 : 280;

  return (
    <>
      <div className="border-t border-border/50">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 h-10 bg-card/80 backdrop-blur-sm cursor-pointer hover:bg-muted/20 transition-all select-none"
          onClick={onToggle}
        >
          <div className="flex items-center gap-2.5">
            <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground/80 uppercase tracking-wider">Terminal</span>
            {logs.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-md bg-muted text-muted-foreground font-mono">
                {logs.length}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground font-mono px-1.5 py-0.5 rounded bg-muted/50 uppercase">
              {language}
            </span>
            {isWebFile && (
              <span className="text-[10px] text-primary/70 flex items-center gap-1">
                <Eye className="h-3 w-3" /> Preview
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {inputLanguages.includes(language) && codeNeedsInput() && (
              <span className="text-[10px] text-amber-400/70 flex items-center gap-1">
                <Keyboard className="h-3 w-3" /> Input
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); handleRunClick(); }}
              disabled={isRunning || !code.trim()}
              className={cn(
                "h-7 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all",
                isRunning
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              )}
            >
              {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {isRunning ? "Running" : "Run"}
            </button>
            {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </div>

        {/* Content */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: terminalHeight }}
              exit={{ height: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div style={{ height: terminalHeight }} className="flex flex-col bg-background">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-3 h-9 border-b border-border/40 bg-card/40">
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setActiveTab("console")}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                        activeTab === "console"
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Code2 className="h-3 w-3" />
                      Console
                    </button>
                    <button
                      onClick={() => setActiveTab("preview")}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                        activeTab === "preview"
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Eye className="h-3 w-3" />
                      Preview
                      {previewHtml && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    {activeTab === "preview" && previewUrl && (
                      <button
                        onClick={() => { const html = buildWebPreview(); setPreviewHtml(""); setTimeout(() => setPreviewHtml(html), 50); }}
                        className="p-1 rounded hover:bg-muted/50 transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className="p-1 rounded hover:bg-muted/50 transition-colors"
                      title={expanded ? "Minimize" : "Maximize"}
                    >
                      {expanded ? <Minimize2 className="h-3 w-3 text-muted-foreground" /> : <Maximize2 className="h-3 w-3 text-muted-foreground" />}
                    </button>
                    <button
                      onClick={() => { if (activeTab === "console") clearLogs(); else setPreviewHtml(""); }}
                      className="p-1 rounded hover:bg-muted/50 transition-colors"
                      title="Clear"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {/* Console */}
                {activeTab === "console" && (
                  <>
                    <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
                      {logs.length === 0 ? (
                        <div className="text-muted-foreground/60 flex flex-col items-center justify-center h-full gap-3">
                          <TerminalIcon className="h-8 w-8 opacity-20" />
                          <div className="text-center">
                            <p className="text-sm font-sans font-medium mb-1">Terminal ready</p>
                            <p className="text-xs text-muted-foreground/50 font-sans">
                              Click Run or enter a command
                            </p>
                          </div>
                          <div className="flex flex-wrap justify-center gap-1.5 mt-2 text-[10px]">
                            {["HTML", "CSS", "JS", "TSX", "Python", "C++", "Java", "Go", "Rust"].map(l => (
                              <span key={l} className="px-2 py-0.5 rounded bg-muted/30 text-muted-foreground/50">{l}</span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        logs.map((log, index) => (
                          <div
                            key={index}
                            className={cn("flex gap-2 py-0.5 leading-relaxed", getLogColor(log.type))}
                          >
                            <span className="w-4 text-center flex-shrink-0 opacity-60">{getLogIcon(log.type)}</span>
                            <span className="text-muted-foreground/30 text-[10px] w-14 flex-shrink-0 tabular-nums pt-px">
                              {log.timestamp.toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            <pre className="whitespace-pre-wrap break-all flex-1">{log.content}</pre>
                          </div>
                        ))
                      )}
                      <div ref={logsEndRef} />
                    </div>

                    {/* Command input */}
                    <div className="border-t border-border/30 px-3 py-1.5 bg-card/20">
                      <div className="flex items-center gap-2">
                        <span className="text-primary/60 font-mono text-xs">$</span>
                        <input
                          type="text"
                          placeholder="run, help, node, python..."
                          className="flex-1 bg-transparent text-foreground font-mono text-xs outline-none placeholder:text-muted-foreground/30"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const value = e.currentTarget.value.trim();
                              if (!value) return;
                              e.currentTarget.value = '';
                              addLog('info', `$ ${value}`);
                              
                              if (value === 'run') handleRunClick();
                              else if (value === 'clear' || value === 'cls') clearLogs();
                              else if (value === 'help') {
                                addLog('info', 'Available commands:');
                                addLog('log', '  run             - Run current file');
                                addLog('log', '  clear / cls     - Clear terminal');
                                addLog('log', '  echo <text>     - Print text');
                                addLog('log', '  node <file>     - JavaScript');
                                addLog('log', '  python <file>   - Python');
                                addLog('log', '  g++ <file>      - C++');
                                addLog('log', '  exec <lang> <code> - Any language');
                                addLog('log', '  ls / cat <file> - Files');
                              } else if (value.startsWith('echo ')) {
                                addLog('log', value.substring(5));
                              } else if (value === 'ls' || value === 'dir') {
                                if (files && files.length > 0) {
                                  addLog('log', files.map(f => `${f.is_folder ? '📁' : '  '} ${f.path}${f.name}`).join('\n'));
                                } else addLog('info', 'No files available');
                              } else if (value.startsWith('cat ')) {
                                const fileName = value.substring(4).trim();
                                const file = files?.find(f => f.name === fileName || (f.path + f.name) === fileName);
                                if (file && !file.is_folder) addLog('log', file.content || '(empty file)');
                                else addLog('error', `File not found: ${fileName}`);
                              } else if (value === 'date') {
                                addLog('log', new Date().toLocaleString());
                              } else if (value === 'whoami') {
                                addLog('log', 'CodeForge user');
                              } else if (value.startsWith('exec ')) {
                                const parts = value.substring(5).trim();
                                const spaceIdx = parts.indexOf(' ');
                                if (spaceIdx > 0) runCommandOnServer(parts.substring(0, spaceIdx).trim(), parts.substring(spaceIdx + 1).trim());
                                else addLog('error', 'Format: exec <lang> <code>');
                              } else if (value.startsWith('node ')) {
                                const arg = value.substring(5).trim();
                                const file = files?.find(f => f.name === arg);
                                runCommandOnServer('javascript', file ? file.content : arg);
                              } else if (value.startsWith('python ') || value.startsWith('python3 ')) {
                                const arg = value.replace(/^python3?\s+/, '').trim();
                                const file = files?.find(f => f.name === arg);
                                runCommandOnServer('python', file ? file.content : arg);
                              } else if (value.startsWith('g++ ') || value.startsWith('gcc ')) {
                                const cppFile = value.split(' ').pop()?.trim();
                                const file = files?.find(f => f.name === cppFile);
                                if (file) runCommandOnServer(value.startsWith('g++') ? 'cpp' : 'c', file.content);
                                else addLog('error', `File not found: ${cppFile}`);
                              } else if (value.startsWith('java ') || value.startsWith('javac ')) {
                                const jFile = value.split(' ').pop()?.trim();
                                const file = files?.find(f => f.name === jFile);
                                if (file) runCommandOnServer('java', file.content);
                                else addLog('error', `File not found: ${jFile}`);
                              } else if (value.startsWith('go run ')) {
                                const goFile = value.substring(7).trim();
                                const file = files?.find(f => f.name === goFile);
                                if (file) runCommandOnServer('go', file.content);
                                else addLog('error', `File not found: ${goFile}`);
                              } else if (value.startsWith('swift ')) {
                                const arg = value.substring(6).trim();
                                const file = files?.find(f => f.name === arg);
                                runCommandOnServer('swift', file ? file.content : arg);
                              } else if (/^(ruby|php|lua|bash|sh|perl|kotlin|dart|rust|scala|r)\s/.test(value)) {
                                const cmdParts = value.split(' ');
                                let cmdLang = cmdParts[0] === 'sh' ? 'bash' : cmdParts[0];
                                const cmdArg = cmdParts.slice(1).join(' ').trim();
                                const file = files?.find(f => f.name === cmdArg);
                                runCommandOnServer(cmdLang, file ? file.content : cmdArg);
                              } else if (value.startsWith('npm ') || value.startsWith('yarn ') || value.startsWith('npx ')) {
                                addLog('warn', 'npm/yarn/npx are not supported.');
                              } else {
                                addLog('warn', `Unknown command: ${value}. Type "help".`);
                              }
                            }
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Preview */}
                {activeTab === "preview" && (
                  <div className="flex-1 overflow-hidden bg-background">
                    {previewUrl ? (
                      <iframe
                        ref={iframeRef}
                        src={previewUrl}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-modals allow-forms allow-same-origin allow-popups"
                        title="Web Preview"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground/50">
                        <div className="text-center">
                          <Eye className="h-8 w-8 mx-auto mb-3 opacity-20" />
                          <p className="text-sm font-medium mb-1">Preview is empty</p>
                          <p className="text-xs text-muted-foreground/40">
                            Run an HTML, CSS, JS, or TSX file
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input Dialog */}
      <Dialog open={showInputDialog} onOpenChange={setShowInputDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Keyboard className="h-4 w-4" />
              Program input
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Enter each value on a new line.
            </p>
            <Textarea
              placeholder="Masalan:&#10;5&#10;10&#10;hello"
              value={stdinInput}
              onChange={(e) => setStdinInput(e.target.value)}
              className="min-h-[100px] font-mono text-sm"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowInputDialog(false); runCode(""); }}>
              Without input
            </Button>
            <Button size="sm" onClick={handleRunWithInput}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Terminal;
