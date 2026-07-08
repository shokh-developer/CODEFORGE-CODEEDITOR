import { Braces, Hash, Terminal, Globe, FileCode, FileJson, FileText, File } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusBarProps {
  language: string; fileName?: string; line?: number; column?: number;
}

const getLanguageIcon = (language: string) => {
  const cls = "h-2.5 w-2.5";
  switch (language) {
    case "javascript": case "jsx":
      return <Braces className={cn(cls, "text-yellow-400/80")} />;
    case "typescript": case "tsx":
      return <FileCode className={cn(cls, "text-blue-400/80")} />;
    case "html":
      return <Globe className={cn(cls, "text-orange-400/80")} />;
    case "css": case "scss":
      return <Hash className={cn(cls, "text-pink-400/80")} />;
    case "json":
      return <FileJson className={cn(cls, "text-yellow-300/80")} />;
    case "python":
      return <Terminal className={cn(cls, "text-green-400/80")} />;
    case "markdown":
      return <FileText className={cn(cls, "text-slate-400/80")} />;
    case "go":
      return <FileCode className={cn(cls, "text-cyan-400/80")} />;
    case "rust":
      return <FileCode className={cn(cls, "text-orange-500/80")} />;
    case "java":
      return <FileCode className={cn(cls, "text-red-400/80")} />;
    case "cpp": case "c":
      return <FileCode className={cn(cls, "text-blue-500/80")} />;
    case "csharp":
      return <FileCode className={cn(cls, "text-purple-400/80")} />;
    case "php":
      return <FileCode className={cn(cls, "text-violet-400/80")} />;
    case "ruby":
      return <FileCode className={cn(cls, "text-red-500/80")} />;
    case "swift":
      return <FileCode className={cn(cls, "text-orange-400/80")} />;
    case "kotlin":
      return <FileCode className={cn(cls, "text-purple-500/80")} />;
    case "dart":
      return <FileCode className={cn(cls, "text-cyan-500/80")} />;
    case "sql":
      return <FileJson className={cn(cls, "text-emerald-400/80")} />;
    case "bash": case "shell":
      return <Terminal className={cn(cls, "text-emerald-500/80")} />;
    case "yaml":
      return <FileText className={cn(cls, "text-yellow-500/80")} />;
    case "xml":
      return <FileCode className={cn(cls, "text-orange-300/80")} />;
    default: return <File className={cn(cls, "text-muted-foreground/50")} />;
  }
};

const StatusBar = ({ language, fileName, line = 1, column = 1 }: StatusBarProps) => {
  return (
    <div className="flex items-center justify-between h-[22px] px-3 border-t border-border/35 flex-shrink-0" style={{ background: 'hsl(var(--sidebar-background))' }}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500/80" />
          </span>
          <span className="text-[9px] text-muted-foreground/50 font-medium">Synced</span>
        </div>
        {fileName && (
          <span className="text-[9px] text-muted-foreground/40 hidden sm:inline truncate max-w-[160px]">{fileName}</span>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-[9px] text-muted-foreground/40 font-mono tabular-nums">Ln {line}, Col {column}</span>
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/30 border border-border/25">
          {getLanguageIcon(language)}
          <span className="text-[9px] text-muted-foreground/60 capitalize">{language}</span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
