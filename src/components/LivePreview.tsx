import { useState, useEffect, useRef, useCallback } from "react";
import { Eye, RefreshCw, ExternalLink, Smartphone, Monitor, Tablet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildPreviewHtml } from "@/lib/live-preview";

interface FileItem {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  is_folder: boolean;
}

interface LivePreviewProps {
  files: FileItem[];
  activeFile: FileItem | null;
  isOpen: boolean;
  onToggle: () => void;
}

type ViewportSize = "mobile" | "tablet" | "desktop";

const viewportSizes: Record<ViewportSize, { width: string; label: string; icon: any }> = {
  mobile: { width: "375px", label: "Mobile", icon: Smartphone },
  tablet: { width: "768px", label: "Tablet", icon: Tablet },
  desktop: { width: "100%", label: "Desktop", icon: Monitor },
};

const LivePreview = ({ files, activeFile, isOpen, onToggle }: LivePreviewProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const cleanupPreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const buildPreview = useCallback(() => {
    const previewableFiles = files.filter(f => !f.is_folder && /\.(html|tsx|ts|jsx|js)$/.test(f.name));
    if (previewableFiles.length === 0) {
      cleanupPreviewUrl();
      setPreviewUrl("");
      return;
    }

    const htmlContent = buildPreviewHtml(files);
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    cleanupPreviewUrl();
    previewUrlRef.current = url;
    setPreviewUrl(url);
    return () => {
      if (previewUrlRef.current === url) {
        URL.revokeObjectURL(url);
        previewUrlRef.current = null;
      }
    };
  }, [files, cleanupPreviewUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const cleanup = buildPreview();
    return () => cleanup?.();
  }, [isOpen, buildPreview]);

  useEffect(() => () => cleanupPreviewUrl(), [cleanupPreviewUrl]);

  const refresh = () => buildPreview();

  const openExternal = () => {
    if (previewUrl) window.open(previewUrl, "_blank");
  };

  if (!isOpen) return null;

  const hasPreviewable = files.some(f => /\.(html|tsx|ts|jsx|js)$/.test(f.name) && !f.is_folder);

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Toolbar */}
      <div className="h-9 flex items-center justify-between px-2 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-1">
          <Eye className="h-3.5 w-3.5 text-primary mr-1" />
          <span className="text-[11px] font-medium text-muted-foreground">Preview</span>
        </div>

        <div className="flex items-center gap-0.5">
          {(Object.keys(viewportSizes) as ViewportSize[]).map(size => {
            const { icon: Icon, label } = viewportSizes[size];
            return (
              <button
                key={size}
                onClick={() => setViewport(size)}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  viewport === size ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                title={label}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
          <div className="w-px h-4 bg-border mx-1" />
          <button onClick={refresh} className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={openExternal} className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors" title="Open in new tab">
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button onClick={onToggle} className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors" title="Close preview">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 flex items-start justify-center p-2 overflow-auto bg-[#0a0a0f]">
        {hasPreviewable ? (
          <div
            className="bg-background rounded-lg overflow-hidden shadow-lg border border-border/30 h-full transition-all duration-300"
            style={{ width: viewportSizes[viewport].width, maxWidth: "100%" }}
          >
            <iframe
              ref={iframeRef}
              src={previewUrl}
              className="w-full h-full border-0"
              title="Live Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-muted/20 flex items-center justify-center">
              <Eye className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">No previewable files</p>
            <p className="text-xs text-muted-foreground/70">Create an HTML or TSX file to preview</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LivePreview;
