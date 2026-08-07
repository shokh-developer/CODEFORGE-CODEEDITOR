import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen, Trash2, Edit2,
  FileCode, FileJson, FileText, Braces, Hash, Terminal, Globe, X, Check, FolderPlus, FilePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FileIcon, FolderIcon } from "@/components/FileIcon";
import { Input } from "@/components/ui/input";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator,
} from "@/components/ui/context-menu";

interface FileItem {
  id: string; name: string; path: string; content: string; language: string; is_folder: boolean;
}

interface FileExplorerProps {
  files: FileItem[]; activeFileId: string | null;
  onFileSelect: (file: FileItem) => void;
  onCreateFile: (name: string, path: string, isFolder: boolean, language?: string) => void;
  onDeleteFile: (fileId: string) => void;
  onRenameFile: (fileId: string, newName: string) => void;
}

const getLanguageFromName = (name: string): string => {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
    html: "html", htm: "html",
    css: "css", scss: "scss", sass: "scss", less: "css",
    json: "json", jsonc: "json",
    py: "python", pyw: "python",
    md: "markdown", mdx: "markdown", markdown: "markdown",
    cpp: "cpp", cc: "cpp", cxx: "cpp", h: "cpp", hpp: "cpp", hxx: "cpp",
    c: "c", cs: "csharp",
    java: "java", go: "go", rs: "rust",
    php: "php", rb: "ruby", swift: "swift",
    kt: "kotlin", kts: "kotlin",
    dart: "dart", lua: "lua",
    sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
    sql: "sql", yaml: "yaml", yml: "yaml",
    xml: "xml", svg: "xml",
    scala: "scala", pl: "perl", r: "r",
    toml: "toml", ini: "ini",
  };
  return map[ext || ""] || "plaintext";
};

const FileExplorer = ({ files, activeFileId, onFileSelect, onCreateFile, onDeleteFile, onRenameFile }: FileExplorerProps) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["/"]))
  const [isCreating, setIsCreating] = useState<{ type: "file" | "folder"; path: string } | null>(null);
  const prevLengthRef = useRef(0);

  // When new files are added, auto-expand all their ancestor folder paths.
  // This ensures files created by the AI are immediately visible in the tree.
  useEffect(() => {
    if (files.length <= prevLengthRef.current) {
      prevLengthRef.current = files.length;
      return;
    }
    prevLengthRef.current = files.length;
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.add("/");
      for (const f of files) {
        const segs = f.path.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
        let cur = "/";
        for (const seg of segs) {
          cur = cur === "/" ? `/${seg}/` : `${cur}${seg}/`;
          next.add(cur);
        }
        if (f.is_folder) next.add(f.path + f.name + "/");
      }
      return next;
    });
  }, [files.length]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); } else { next.add(path); }
      return next;
    });
  };

  const handleCreate = () => {
    if (!newName.trim() || !isCreating) return;
    onCreateFile(newName.trim(), isCreating.path, isCreating.type === "folder", getLanguageFromName(newName));
    setNewName(""); setIsCreating(null);
  };

  const handleRename = (fileId: string) => {
    if (!editName.trim()) return;
    onRenameFile(fileId, editName.trim());
    setEditingId(null); setEditName("");
  };

  const buildTree = (currentPath: string = "/") => {
    const items = files.filter(f => f.path === currentPath);
    return [...items.filter(f => f.is_folder), ...items.filter(f => !f.is_folder)];
  };

  const renderItem = (file: FileItem, depth: number = 0) => {
    const isActive = activeFileId === file.id;
    const childPath = file.path + file.name + "/";
    const isExpanded = expandedFolders.has(childPath);
    const children = files.filter(f => f.path === childPath);

    return (
      <div key={file.id}>
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              className={cn(
                "group flex items-center gap-1 py-[3px] cursor-pointer text-xs transition-colors duration-100 border-l-2 select-none",
                isActive
                  ? "bg-primary/12 text-primary border-l-primary/80"
                  : "text-muted-foreground/70 hover:bg-white/[0.03] hover:text-foreground/85 border-l-transparent"
              )}
              style={{ paddingLeft: `${depth * 10 + 6}px`, paddingRight: "6px" }}
              onClick={() => file.is_folder ? toggleFolder(childPath) : onFileSelect(file)}
            >
              {file.is_folder ? (
                <>
                  {isExpanded
                    ? <ChevronDown className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                    : <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />}
                  {isExpanded
                    ? <FolderIcon open className="h-3.5 w-3.5" />
                    : <FolderIcon className="h-3.5 w-3.5" />}
                </>
              ) : (
                <>
                  <span className="w-3 flex-shrink-0" />
                  <FileIcon name={file.name} className="h-3.5 w-3.5" />
                </>
              )}
              {editingId === file.id ? (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-5 text-xs px-1 py-0" autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(file.id); if (e.key === "Escape") setEditingId(null); }}
                    onClick={(e) => e.stopPropagation()} />
                  <Check className="h-3 w-3 text-primary cursor-pointer flex-shrink-0" onClick={(e) => { e.stopPropagation(); handleRename(file.id); }} />
                  <X className="h-3 w-3 text-destructive cursor-pointer flex-shrink-0" onClick={(e) => { e.stopPropagation(); setEditingId(null); }} />
                </div>
              ) : (
                <span className="truncate flex-1 text-[11px]">{file.name}</span>
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {file.is_folder && (
              <>
                <ContextMenuItem onClick={() => setIsCreating({ type: "file", path: childPath })} className="cursor-pointer text-xs gap-2">
                  <FilePlus className="h-3.5 w-3.5" /> New file
                </ContextMenuItem>
                <ContextMenuItem onClick={() => setIsCreating({ type: "folder", path: childPath })} className="cursor-pointer text-xs gap-2">
                  <FolderPlus className="h-3.5 w-3.5" /> New folder
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem onClick={() => { setEditingId(file.id); setEditName(file.name); }} className="cursor-pointer text-xs gap-2">
              <Edit2 className="h-3.5 w-3.5" /> Rename
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onDeleteFile(file.id)} className="text-destructive cursor-pointer text-xs gap-2">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <AnimatePresence>
          {file.is_folder && isExpanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.14 }}>
              {children.map(child => renderItem(child, depth + 1))}
              {isCreating?.path === childPath && renderCreateInput(depth + 1)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderCreateInput = (depth: number) => (
    <div className="flex items-center gap-1 py-px" style={{ paddingLeft: `${depth * 10 + 6}px`, paddingRight: "6px" }}>
      {isCreating?.type === "folder"
        ? <FolderIcon className="h-3.5 w-3.5" />
        : <File className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />}
      <Input value={newName} onChange={(e) => setNewName(e.target.value)}
        placeholder={isCreating?.type === "folder" ? "folder name..." : "file name..."}
        className="h-5 text-xs px-1 flex-1" autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setIsCreating(null); }} />
      <Check className="h-3 w-3 text-primary cursor-pointer flex-shrink-0" onClick={handleCreate} />
      <X className="h-3 w-3 text-destructive cursor-pointer flex-shrink-0" onClick={() => setIsCreating(null)} />
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-card border-r border-border/50">
      <div className="flex items-center justify-between px-2 h-7 border-b border-border/40 flex-shrink-0" style={{ background: 'linear-gradient(to bottom, hsl(var(--card) / 0.7), hsl(var(--card) / 0.5))' }}>
        <span className="text-[9px] text-muted-foreground/45 uppercase tracking-[0.16em] font-semibold">Files</span>
        <div className="flex items-center gap-0.5">
          <button
            className="p-0.5 rounded hover:bg-white/[0.06] transition-colors duration-150"
            onClick={() => setIsCreating({ type: "file", path: "/" })}
            title="New file"
          >
            <FilePlus className="h-3 w-3 text-muted-foreground/50 hover:text-foreground/80 transition-colors" />
          </button>
          <button
            className="p-0.5 rounded hover:bg-white/[0.06] transition-colors duration-150"
            onClick={() => setIsCreating({ type: "folder", path: "/" })}
            title="New folder"
          >
            <FolderPlus className="h-3 w-3 text-muted-foreground/50 hover:text-foreground/80 transition-colors" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-px">
        {buildTree("/").map(item => renderItem(item, 0))}
        {isCreating?.path === "/" && renderCreateInput(0)}
      </div>
    </div>
  );
};

export default FileExplorer;
