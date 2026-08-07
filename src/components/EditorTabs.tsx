import { X } from "lucide-react";
import { FileIcon } from "@/components/FileIcon";
import { cn } from "@/lib/utils";

interface FileTab { id: string; name: string; language: string; }

interface EditorTabsProps {
  tabs: FileTab[]; activeTabId: string | null;
  onTabSelect: (id: string) => void; onTabClose: (id: string) => void;
}

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
            <FileIcon name={tab.name} className="h-3 w-3" />
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
