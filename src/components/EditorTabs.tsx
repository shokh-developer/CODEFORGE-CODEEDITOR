import { X, FileCode, Braces, Globe, Hash, FileJson, Terminal, FileText, File } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileTab { id: string; name: string; language: string; }

interface EditorTabsProps {
  tabs: FileTab[]; activeTabId: string | null;
  onTabSelect: (id: string) => void; onTabClose: (id: string) => void;
}

const getFileIcon = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  const cls = "h-3 w-3 flex-shrink-0";
  switch (ext) {
    case "js": case "jsx": case "mjs": case "cjs":
      return <Braces className={cn(cls, "text-yellow-400/85")} />;
    case "ts": case "tsx": case "mts": case "cts":
      return <FileCode className={cn(cls, "text-blue-400/85")} />;
    case "html": case "htm":
      return <Globe className={cn(cls, "text-orange-400/85")} />;
    case "css": case "scss": case "sass": case "less":
      return <Hash className={cn(cls, "text-pink-400/85")} />;
    case "json": case "jsonc":
      return <FileJson className={cn(cls, "text-yellow-300/85")} />;
    case "py": case "pyw":
      return <Terminal className={cn(cls, "text-green-400/85")} />;
    case "md": case "mdx": case "markdown":
      return <FileText className={cn(cls, "text-slate-400/85")} />;
    case "cpp": case "cc": case "cxx": case "c": case "h": case "hpp": case "hxx":
      return <FileCode className={cn(cls, "text-blue-500/85")} />;
    case "cs": return <FileCode className={cn(cls, "text-purple-400/85")} />;
    case "java": return <FileCode className={cn(cls, "text-red-400/85")} />;
    case "go": return <FileCode className={cn(cls, "text-cyan-400/85")} />;
    case "rs": return <FileCode className={cn(cls, "text-orange-500/85")} />;
    case "php": return <FileCode className={cn(cls, "text-violet-400/85")} />;
    case "rb": return <FileCode className={cn(cls, "text-red-500/85")} />;
    case "swift": return <FileCode className={cn(cls, "text-orange-400/85")} />;
    case "kt": case "kts": return <FileCode className={cn(cls, "text-purple-500/85")} />;
    case "dart": return <FileCode className={cn(cls, "text-cyan-500/85")} />;
    case "lua": return <FileCode className={cn(cls, "text-blue-300/85")} />;
    case "sql": return <FileJson className={cn(cls, "text-emerald-400/85")} />;
    case "sh": case "bash": case "zsh":
      return <Terminal className={cn(cls, "text-emerald-500/85")} />;
    case "yaml": case "yml":
      return <FileText className={cn(cls, "text-yellow-500/85")} />;
    case "xml": case "svg":
      return <FileCode className={cn(cls, "text-orange-300/85")} />;
    default: return <File className={cn(cls, "text-muted-foreground/50")} />;
  }
};

const EditorTabs = ({ tabs, activeTabId, onTabSelect, onTabClose }: EditorTabsProps) => {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-stretch bg-card/60 border-b border-border/40 overflow-x-auto flex-shrink-0 h-7">
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id;
        return (
          <div
            key={tab.id}
            className={cn(
              "group flex items-center gap-1 px-2.5 border-r border-border/30 cursor-pointer transition-all duration-120 min-w-[60px] max-w-[140px] border-t-[1.5px]",
              isActive
                ? "bg-background/70 border-t-primary text-foreground"
                : "bg-transparent border-t-transparent text-muted-foreground/50 hover:bg-white/[0.03] hover:text-muted-foreground/75"
            )}
            onClick={() => onTabSelect(tab.id)}
          >
            {getFileIcon(tab.name)}
            <span className="truncate flex-1 text-[10px] font-medium">{tab.name}</span>
            <button
              className={cn(
                "p-0.5 rounded transition-all duration-120 flex-shrink-0",
                isActive ? "opacity-60 hover:opacity-100 hover:bg-destructive/20" : "opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-destructive/20"
              )}
              onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default EditorTabs;
