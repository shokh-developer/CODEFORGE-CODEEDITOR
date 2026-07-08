import { Users, Check, Share2, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import ZipManager from "./ZipManager";

interface FileItem {
  id: string; name: string; path: string; content: string; language: string; is_folder: boolean;
}

interface EditorHeaderProps {
  roomId: string; roomName: string; activeFileName?: string; onlineUsers?: number;
  files?: FileItem[];
  onFilesImported?: (files: { name: string; path: string; content: string; language: string }[]) => void;
}

const EditorHeader = ({ roomId, roomName, activeFileName, onlineUsers = 1, files = [], onFilesImported }: EditorHeaderProps) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const shortId = roomId.slice(0, 8);

  const copyRoomLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
    setCopied(true);
    toast({ title: "Link copied!", description: "Share it and start coding together." });
    setTimeout(() => setCopied(false), 2000);
  };

  const copyRoomId = async () => {
    await navigator.clipboard.writeText(roomId);
    toast({ title: "ID copied!", description: roomId });
  };

  return (
    <div className="flex items-center justify-between h-full px-2 flex-shrink-0" style={{ background: 'linear-gradient(to bottom, hsl(var(--card) / 0.8), hsl(var(--card) / 0.6))' }}>
      {/* Left: room name + breadcrumb */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[11px] font-semibold text-foreground/90 truncate">{roomName}</span>
        <button
          onClick={copyRoomId}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors flex-shrink-0"
          title="Copy room ID"
        >
          <Hash className="h-2 w-2 text-muted-foreground/40" />
          <span className="text-[9px] text-muted-foreground/50 font-mono tabular-nums">{shortId}</span>
        </button>
        {activeFileName && (
          <>
            <span className="text-muted-foreground/25 hidden md:inline text-[11px]">/</span>
            <span className="text-[11px] text-primary/70 font-medium hidden md:inline truncate max-w-[160px]">{activeFileName}</span>
          </>
        )}
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {onFilesImported && <ZipManager files={files} onFilesImported={onFilesImported} roomName={roomName} />}

        <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[9px] text-emerald-400/80 font-medium">Synced</span>
        </div>

        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/40 border border-border/30">
          <Users className="h-2.5 w-2.5 text-muted-foreground/60" />
          <span className="font-semibold text-foreground/80 text-[10px] tabular-nums">{onlineUsers}</span>
        </div>

        <Button
          size="sm"
          variant="default"
          className="h-6 text-[10px] px-2 gap-1 rounded font-medium"
          onClick={copyRoomLink}
        >
          {copied ? <Check className="h-2.5 w-2.5" /> : <Share2 className="h-2.5 w-2.5" />}
          <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
        </Button>
      </div>
    </div>
  );
};

export default EditorHeader;
