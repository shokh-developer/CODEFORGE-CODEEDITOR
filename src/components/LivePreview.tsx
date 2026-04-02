import { useState, useEffect, useRef, useCallback } from "react";
import { Eye, RefreshCw, ExternalLink, Smartphone, Monitor, Tablet, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const buildPreview = useCallback(() => {
    const htmlFile = files.find(f => f.name.endsWith(".html") && !f.is_folder);
    if (!htmlFile) return;

    let htmlContent = htmlFile.content;

    // Inject CSS files
    const cssFiles = files.filter(f => f.name.endsWith(".css") && !f.is_folder);
    const cssInject = cssFiles.map(f => `<style>/* ${f.name} */\n${f.content}</style>`).join("\n");

    // Inject JS files
    const jsFiles = files.filter(f => (f.name.endsWith(".js") || f.name.endsWith(".ts")) && !f.is_folder && f.name !== htmlFile.name);
    const jsInject = jsFiles.map(f => `<script>/* ${f.name} */\n${f.content}</script>`).join("\n");

    // Inject before </head> or at end
    if (htmlContent.includes("</head>")) {
      htmlContent = htmlContent.replace("</head>", `${cssInject}\n</head>`);
    } else {
      htmlContent = cssInject + htmlContent;
    }

    if (htmlContent.includes("</body>")) {
      htmlContent = htmlContent.replace("</body>", `${jsInject}\n</body>`);
    } else {
      htmlContent += jsInject;
    }

    // Add dark theme base styles
    if (!htmlContent.includes("background-color") && !htmlContent.includes("background:")) {
      const darkStyles = `<style>
        body { background-color: #0a0a0f; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; margin: 0; }
        * { box-sizing: border-box; }
      </style>`;
      if (htmlContent.includes("<head>")) {
        htmlContent = htmlContent.replace("<head>", `<head>\n${darkStyles}`);
      } else {
        htmlContent = darkStyles + htmlContent;
      }
    }

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);

  useEffect(() => {
    if (isOpen) buildPreview();
  }, [isOpen, files, buildPreview]);

  const refresh = () => buildPreview();

  const openExternal = () => {
    if (previewUrl) window.open(previewUrl, "_blank");
  };

  if (!isOpen) return null;

  const hasHtml = files.some(f => f.name.endsWith(".html") && !f.is_folder);

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
        {hasHtml ? (
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
            <p className="text-sm text-muted-foreground">No HTML file to preview</p>
            <p className="text-xs text-muted-foreground/70">Create an HTML file or use /generate to create a project</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LivePreview;
