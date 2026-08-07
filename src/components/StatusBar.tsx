import { LanguageIcon } from "@/components/FileIcon";

interface StatusBarProps {
  language: string; fileName?: string; line?: number; column?: number;
}

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
          <LanguageIcon language={language} className="h-2.5 w-2.5" />
          <span className="text-[9px] text-muted-foreground/60 capitalize">{language}</span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
