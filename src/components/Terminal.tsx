import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Trash2, Terminal as TerminalIcon, ChevronUp, ChevronDown, Loader2, Keyboard, Maximize2, Minimize2 } from "lucide-react";

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

  const runCodeInBrowser = () => {
    try {
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
      if (["javascript", "jsx"].includes(language)) {
        runCodeInBrowser();
      } else if (backendLanguages.includes(language)) {
        await runCodeOnServer(stdin);
      } else {
        addLog("info", `Use the 👁 Preview button to see HTML/CSS/TSX output.`);
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

  const terminalHeight = expanded ? 500 : 220;

  return (
    <>
      <div className="border-t border-border/50">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 h-9 bg-card/80 backdrop-blur-sm cursor-pointer hover:bg-muted/20 transition-all select-none"
          onClick={onToggle}
        >
          <div className="flex items-center gap-2.5">
            <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-foreground/80 uppercase tracking-wider">Console</span>
            {logs.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-md bg-muted text-muted-foreground font-mono">
                {logs.length}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground font-mono px-1.5 py-0.5 rounded bg-muted/50 uppercase">
              {language}
            </span>
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
                "h-6 px-2.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all",
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
                <div className="flex items-center justify-between px-3 h-8 border-b border-border/40 bg-card/40">
                  <span className="text-[11px] font-medium text-muted-foreground">Console Output</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className="p-1 rounded hover:bg-muted/50 transition-colors"
                      title={expanded ? "Minimize" : "Maximize"}
                    >
                      {expanded ? <Minimize2 className="h-3 w-3 text-muted-foreground" /> : <Maximize2 className="h-3 w-3 text-muted-foreground" />}
                    </button>
                    <button
                      onClick={clearLogs}
                      className="p-1 rounded hover:bg-muted/50 transition-colors"
                      title="Clear"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {/* Logs */}
                <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
                  {logs.length === 0 ? (
                    <div className="text-muted-foreground/60 flex flex-col items-center justify-center h-full gap-2">
                      <TerminalIcon className="h-6 w-6 opacity-20" />
                      <p className="text-[11px] font-sans font-medium">Console ready</p>
                      <p className="text-[10px] text-muted-foreground/50 font-sans">Click Run or type a command below</p>
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
                          } else if (/^(ruby|php|lua|bash|sh|perl|kotlin|dart|rust|scala|swift|r)\s/.test(value)) {
                            const cmdParts = value.split(' ');
                            const cmdLang = cmdParts[0] === 'sh' ? 'bash' : cmdParts[0];
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
            <p className="text-xs text-muted-foreground">Enter each value on a new line.</p>
            <Textarea
              placeholder={"5\n10\nhello"}
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
