import { diffLines } from "diff";
import { Check, X, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ProposedChangeProps {
  filePath: string;
  oldContent: string;
  newContent: string;
  isNew?: boolean;
  status?: "pending" | "accepted" | "rejected";
  onAccept: () => void;
  onReject: () => void;
}

const ProposedChange = ({
  filePath,
  oldContent,
  newContent,
  isNew = false,
  status = "pending",
  onAccept,
  onReject,
}: ProposedChangeProps) => {
  const parts = diffLines(oldContent, newContent);
  const added = parts.filter(p => p.added).reduce((n, p) => n + (p.count ?? 0), 0);
  const removed = parts.filter(p => p.removed).reduce((n, p) => n + (p.count ?? 0), 0);

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden my-1.5",
      status !== "pending" ? "opacity-50 border-border/30" : "border-border/50",
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/30 border-b border-border/30">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileCode className="h-2.5 w-2.5 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-[9px] font-mono text-foreground/70 truncate">
            {filePath || "active file"}
          </span>
          {isNew && (
            <Badge className="h-3.5 px-1 text-[7px] shrink-0 bg-emerald-500/12 text-emerald-400/80 border border-emerald-500/25 rounded-sm">
              new
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[9px] ml-2 flex-shrink-0 font-mono">
          {added > 0 && <span className="text-emerald-400/80">+{added}</span>}
          {removed > 0 && <span className="text-red-400/80">-{removed}</span>}
        </div>
      </div>

      {/* Diff */}
      <div className="font-mono text-[9.5px] max-h-48 overflow-y-auto" style={{ background: 'hsl(var(--background) / 0.7)' }}>
        {parts.map((part, pi) => {
          const lines = part.value.split("\n");
          const visible = part.value.endsWith("\n") ? lines.slice(0, -1) : lines;
          return visible.map((line, li) => (
            <div
              key={`${pi}-${li}`}
              className={cn(
                "flex items-start px-2.5 py-px leading-[1.6]",
                part.added && "bg-emerald-950/50 text-emerald-300/90",
                part.removed && "bg-red-950/50 text-red-300/80",
                !part.added && !part.removed && "text-muted-foreground/55",
              )}
            >
              <span className="mr-2 opacity-40 select-none w-3 text-center flex-shrink-0 text-[8px]">
                {part.added ? "+" : part.removed ? "−" : " "}
              </span>
              <span className="whitespace-pre-wrap break-all">{line || " "}</span>
            </div>
          ));
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-border/25 bg-muted/15">
        <span className="text-[9px] text-muted-foreground/50">
          {status === "accepted" ? "✓ Applied" : status === "rejected" ? "✗ Rejected" : "Apply this change?"}
        </span>
        {status === "pending" && (
          <div className="flex gap-1">
            <Button
              size="sm"
              className="h-5 text-[9px] px-2 bg-emerald-700/80 hover:bg-emerald-600 text-white border-0 rounded gap-1"
              onClick={onAccept}
            >
              <Check className="h-2 w-2" /> Yes
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-5 text-[9px] px-2 rounded gap-1 border-border/40"
              onClick={onReject}
            >
              <X className="h-2 w-2" /> No
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProposedChange;
