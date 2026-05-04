import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  Upload,
  Download,
  Package,
  Loader2,
  X,
  FolderArchive,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface FileItem {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  is_folder: boolean;
}

interface ZipManagerProps {
  files: FileItem[];
  onFilesImported: (files: { name: string; path: string; content: string; language: string }[]) => void;
  roomName?: string;
}

const TEXT_EXTENSIONS = new Set([
  "js","jsx","ts","tsx","html","htm","css","scss","sass","less",
  "json","yaml","yml","toml","xml","svg","md","markdown","txt","csv",
  "py","rb","php","go","rs","java","kt","swift","c","cpp","cc","cxx","h","hpp",
  "cs","sh","bash","zsh","sql","graphql","gql","vue","svelte","astro","env",
  "gitignore","dockerfile","makefile","ini","conf","log",
]);

const getLanguageFromName = (name: string): string => {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js": case "jsx": return "javascript";
    case "ts": case "tsx": return "typescript";
    case "html": case "htm": return "html";
    case "css": case "scss": case "sass": case "less": return "css";
    case "json": return "json";
    case "py": return "python";
    case "md": case "markdown": return "markdown";
    case "sql": return "sql";
    case "cpp": case "cc": case "cxx": case "h": case "hpp": return "cpp";
    case "c": return "c";
    case "java": return "java";
    case "go": return "go";
    case "rs": return "rust";
    case "php": return "php";
    case "rb": return "ruby";
    case "swift": return "swift";
    case "kt": return "kotlin";
    case "jar": case "class": return "java";
    case "xml": return "xml";
    case "yaml": case "yml": return "yaml";
    case "sh": case "bash": return "shell";
    default: return "plaintext";
  }
};

const isTextFile = (name: string): boolean => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // No extension: treat as text (Dockerfile, Makefile, etc)
  if (!name.includes(".")) return true;
  return false;
};

const ZipManager = ({ files, onFilesImported, roomName = "project" }: ZipManagerProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string[]>([]);
  const { toast } = useToast();

  const handleUploadZip = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".zip")) {
      toast({
        title: "Xato",
        description: "Faqat .zip formatdagi fayllar qabul qilinadi",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress([]);

    try {
      const zip = await JSZip.loadAsync(file);
      const importedFiles: { name: string; path: string; content: string; language: string }[] = [];
      const progressLog: string[] = [];

      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        
        // Skip hidden files and node_modules
        if (relativePath.startsWith(".") || 
            relativePath.includes("node_modules/") ||
            relativePath.includes("__MACOSX/")) {
          continue;
        }

        try {
          const content = await zipEntry.async("string");
          const pathParts = relativePath.split("/");
          const fileName = pathParts.pop() || "";
          const filePath = "/" + (pathParts.length > 0 ? pathParts.join("/") + "/" : "");

          importedFiles.push({
            name: fileName,
            path: filePath,
            content,
            language: getLanguageFromName(fileName),
          });

          progressLog.push(`✓ ${relativePath}`);
          setUploadProgress([...progressLog]);
        } catch (err) {
          progressLog.push(`✗ ${relativePath} (binary fayl o'tkazib yuborildi)`);
          setUploadProgress([...progressLog]);
        }
      }

      if (importedFiles.length > 0) {
        onFilesImported(importedFiles);
        toast({
          title: "Muvaffaqiyat",
          description: `${importedFiles.length} ta fayl yuklandi`,
        });
      } else {
        toast({
          title: "Xato",
          description: "Zip faylda matn fayllari topilmadi",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Xato",
        description: "Zip faylni o'qishda xatolik yuz berdi",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const handleDownloadZip = async () => {
    if (files.length === 0) {
      toast({
        title: "Xato",
        description: "Yuklab olish uchun fayllar mavjud emas",
        variant: "destructive",
      });
      return;
    }

    setIsDownloading(true);

    try {
      const zip = new JSZip();

      files.forEach((file) => {
        if (!file.is_folder) {
          // Remove leading slash and construct path
          const filePath = file.path === "/" 
            ? file.name 
            : file.path.slice(1) + file.name;
          zip.file(filePath, file.content);
        }
      });

      const blob = await zip.generateAsync({ 
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 9 }
      });

      const timestamp = new Date().toISOString().slice(0, 10);
      saveAs(blob, `${roomName}-${timestamp}.zip`);

      toast({
        title: "Muvaffaqiyat",
        description: `${files.filter(f => !f.is_folder).length} ta fayl yuklab olindi`,
      });
    } catch (error) {
      toast({
        title: "Xato",
        description: "Zip fayl yaratishda xatolik yuz berdi",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <Package className="h-4 w-4" />
          <span className="hidden sm:inline">ZIP</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <FolderArchive className="h-5 w-5 text-primary" />
            Loyiha fayllari
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            ZIP formatda yuklash yoki yuklab olish
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Upload ZIP */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="zip-upload"
              className={`
                relative flex flex-col items-center justify-center p-6 
                border-2 border-dashed rounded-lg cursor-pointer
                transition-colors duration-200
                ${isUploading 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
                }
              `}
            >
              {isUploading ? (
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              )}
              <span className="text-sm font-medium text-foreground">
                {isUploading ? "Yuklanmoqda..." : "ZIP faylni yuklash"}
              </span>
              <span className="text-xs text-muted-foreground mt-1">
                node_modules va yashirin fayllar o'tkazib yuboriladi
              </span>
              <input
                id="zip-upload"
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleUploadZip}
                disabled={isUploading}
              />
            </label>

            {/* Upload progress */}
            <AnimatePresence>
              {uploadProgress.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="max-h-32 overflow-y-auto bg-muted/50 rounded-lg p-2"
                >
                  {uploadProgress.map((log, i) => (
                    <div
                      key={i}
                      className={`text-xs font-mono ${
                        log.startsWith("✓") ? "text-green-400" : "text-yellow-400"
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">yoki</span>
            </div>
          </div>

          {/* Download ZIP */}
          <Button
            onClick={handleDownloadZip}
            disabled={isDownloading || files.filter(f => !f.is_folder).length === 0}
            className="w-full gap-2"
            variant="outline"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isDownloading 
              ? "Tayyorlanmoqda..." 
              : `Loyihani yuklab olish (${files.filter(f => !f.is_folder).length} fayl)`
            }
          </Button>

          {/* File count info */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-3 w-3" />
            <span>Faqat matn fayllari saqlanadi</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ZipManager;
