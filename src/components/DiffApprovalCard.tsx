import { useMemo, useState } from "react";
import { diffLines, type Change } from "diff";
import { Check, X, FilePlus, FileEdit, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileBlock } from "@/lib/ai-file-blocks";

interface FileItem {
  id: string;
  name: string;
  path: string;
  content: string;
  is_folder: boolean;
}

interface Props {
  block: FileBlock;
  existing?: FileItem | null;
  onAccept: (block: FileBlock, existing?: FileItem | null) => Promise<void> | void;
  onReject: () => void;
  status?: "pending" | "accepted" | "rejected" | "working";
}

const renderDiff = (oldText: string, newText: string) => {
  const parts: Change[] = diffLines(oldText, newText);
  let added = 0, removed = 0;
  const rows: { type: "add" | "rem" | "ctx"; text: string }[] = [];
  for (const part of parts) {
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const line of lines) {
      if (part.added) { rows.push({ type: "add", text: line }); added++; }
      else if (part.removed) { rows.push({ type: "rem", text: line }); removed++; }
      else rows.push({ type: "ctx", text: line });
    }
  }
  return { rows, added, removed };
};

const DiffApprovalCard = ({ block, existing, onAccept, onReject, status = "pending" }: Props) => {
  const [open, setOpen] = useState(true);
  const isNew = block.kind === "new" || !existing;
  const oldText = existing?.content || "";
  const { rows, added, removed } = useMemo(() => renderDiff(oldText, block.content), [oldText, block.content]);

  return (
    <div className="my-2 border border-border rounded-md overflow-hidden bg-card/40 text-xs">
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-muted/40 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {isNew ? <FilePlus className="h-3 w-3 text-emerald-400 shrink-0" /> : <FileEdit className="h-3 w-3 text-blue-400 shrink-0" />}
          <span className={cn("text-[9px] px-1 rounded font-medium", isNew ? "bg-emerald-500/15 text-emerald-300" : "bg-blue-500/15 text-blue-300")}>
            {isNew ? "NEW" : "CHANGE"}
          </span>
          <span className="font-mono text-[10px] truncate text-foreground/80" title={block.fullPath}>{block.fullPath}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] font-mono text-emerald-400">+{added}</span>
          <span className="text-[9px] font-mono text-red-400">-{removed}</span>
          <button onClick={() => setOpen(o => !o)} className="text-[9px] text-muted-foreground hover:text-foreground px-1">
            {open ? "hide" : "show"}
          </button>
        </div>
      </div>
      {open && (
        <div className="max-h-[280px] overflow-auto bg-background font-mono text-[10.5px] leading-[1.45]">
          {rows.map((r, i) => (
            <div
              key={i}
              className={cn(
                "px-2 whitespace-pre-wrap break-all border-l-2",
                r.type === "add" && "bg-emerald-950/30 border-emerald-500/60 text-emerald-200",
                r.type === "rem" && "bg-red-950/30 border-red-500/60 text-red-200",
                r.type === "ctx" && "border-transparent text-muted-foreground/80"
              )}
            >
              <span className="select-none mr-1 opacity-50">{r.type === "add" ? "+" : r.type === "rem" ? "-" : " "}</span>
              {r.text || "\u200b"}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-end gap-1.5 px-2 py-1.5 bg-muted/30 border-t border-border">
        {status === "accepted" && <span className="text-[10px] text-emerald-400 mr-auto">✓ Qabul qilindi</span>}
        {status === "rejected" && <span className="text-[10px] text-muted-foreground mr-auto">✕ Bekor qilindi</span>}
        {status === "working" && <Loader2 className="h-3 w-3 animate-spin text-primary mr-auto" />}
        {status === "pending" && (
          <>
            <button
              onClick={onReject}
              className="h-6 px-2 rounded text-[10px] font-medium border border-border bg-background hover:bg-muted flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Yo'q
            </button>
            <button
              onClick={() => onAccept(block, existing)}
              className="h-6 px-2 rounded text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1"
            >
              <Check className="h-3 w-3" /> Ha
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default DiffApprovalCard;
