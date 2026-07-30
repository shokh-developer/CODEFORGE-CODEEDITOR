import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { collectGeneratedFolders, normalizeGeneratedProjectFiles, findDanglingImports, fixExportImportMismatches, type GeneratedProjectFile } from "@/lib/ai-json";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Bot, Send, Loader2, Code, Rocket, Sparkles, Wand2,
  MessageCircle, FilePlus, FolderPlus,
  Bug, Copy, Check, X, History, Plus, PackagePlus, Paperclip,
} from "lucide-react";
import ProposedChangeCard from "@/components/ProposedChange";
import CreditBadge from "@/components/CreditBadge";

// ==================== TYPES ====================

interface PendingChange {
  id: string;
  targetPath: string;   // "" = use active file
  isNew: boolean;
  findBlock?: string;   // if set → patch mode: find this exact snippet and replace it
  newContent: string;   // NEW_FILE: full content; CHANGE_FILE patch: replacement block; legacy: full content
  language: string;
  status: "pending" | "accepted" | "rejected";
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: AIAction[];
  proposedChanges?: PendingChange[];
  generatedFiles?: GeneratedProjectFile[];
}

interface AIAction {
  type: "create_file" | "create_folder" | "apply_code" | "refactor" | "debug";
  name?: string;
  path?: string;
  language?: string;
  content?: string;
  description?: string;
}

interface ChatMessage {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profile?: { display_name: string | null; avatar_url: string | null };
}

interface FileItem {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  is_folder: boolean;
}

interface AttachedImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
}

interface WorkspacePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  roomId: string;
  code: string;
  language: string;
  files: FileItem[];
  activeFile: FileItem | null;
  onCreateFile: (name: string, path: string, isFolder: boolean, language?: string, content?: string) => Promise<any>;
  onBatchCreateFiles?: (entries: Array<{ name: string; path: string; isFolder: boolean; language?: string; content?: string }>) => Promise<{ created: any[]; failedNames: string[] }>;
  onRefreshFiles?: () => Promise<void>;
  onUpdateFileContent: (fileId: string, content: string) => void;
  projectName?: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: Date;
}

type TabId = "buildforge" | "codeforge" | "chat";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const BUILDFORGE_STARTERS = [
  "Modern landing page with responsive sections",
  "Python Telegram bot with start and help commands",
  "Admin dashboard with charts and reusable components",
];

// ==================== CODE BLOCK ====================

const CodeBlock = ({ code, lang }: { code: string; lang: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border/40">
      <div className="flex items-center justify-between px-3 py-1 bg-muted/40 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono text-muted-foreground">{lang}</span>
          <Badge variant="outline" className="h-4 rounded-sm border-primary/30 bg-primary/10 px-1.5 text-[8px] text-primary">
            select + copy
          </Badge>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="p-1 rounded hover:bg-background/60">
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
          </button>
        </div>
      </div>
      <div className="selection:bg-primary/30 selection:text-primary-foreground">
        <SyntaxHighlighter language={lang} style={vscDarkPlus} customStyle={{ margin: 0, fontSize: "11px", padding: "10px" }} showLineNumbers>
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

// ==================== MARKDOWN RENDERER ====================

const MarkdownContent = ({ content, language }: { content: string; language: string }) => (
  <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed break-words [overflow-wrap:anywhere] [word-break:break-word]">
    <ReactMarkdown
      components={{
        code({ className, children }) {
          const match = /language-(\w+)/.exec(className || "");
          const codeStr = String(children).replace(/\n$/, "");
          if (match) return (
            <CodeBlock
              code={codeStr}
              lang={match[1]}
            />
          );
          return <code className="bg-muted/60 px-1 py-0.5 rounded text-[10px] font-mono text-primary">{children}</code>;
        },
        pre: ({ children }) => <>{children}</>,
        p: ({ children }) => <p className="my-1">{children}</p>,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

// ==================== PARSE AI RESPONSE ====================

const parseAIResponse = (
  content: string,
  defaultLang: string,
): { text: string; actions: AIAction[]; proposedChanges: PendingChange[] } => {
  const actions: AIAction[] = [];
  const proposedChanges: PendingChange[] = [];
  let text = content;

  const createFileRegex = /\[CREATE_FILE:\s*([^\],]+),\s*([^\],]+),\s*([^\]]+)\]/gi;
  let match: RegExpExecArray | null;
  while ((match = createFileRegex.exec(content)) !== null)
    actions.push({ type: "create_file", name: match[1].trim(), path: match[2].trim(), language: match[3].trim() });
  text = text.replace(createFileRegex, "");

  const createFolderRegex = /\[CREATE_FOLDER:\s*([^\],]+),\s*([^\]]+)\]/gi;
  while ((match = createFolderRegex.exec(content)) !== null)
    actions.push({ type: "create_folder", name: match[1].trim(), path: match[2].trim() });
  text = text.replace(createFolderRegex, "");

  // NEW patch format: [CHANGE_FILE: path]\n[FIND]\n...\n[/FIND]\n[REPLACE]\n...\n[/REPLACE]
  // This replaces only the found snippet, preserving the rest of the file.
  const changeFilePatchRegex = /\[CHANGE_FILE:\s*([^\]]+)\]\s*\n\[FIND\]\n([\s\S]*?)\n\[\/FIND\]\s*\n\[REPLACE\]\n([\s\S]*?)\n\[\/REPLACE\]/g;
  while ((match = changeFilePatchRegex.exec(content)) !== null) {
    proposedChanges.push({
      id: generateId(),
      targetPath: match[1].trim(),
      isNew: false,
      findBlock: match[2],   // exact snippet to find in the existing file
      newContent: match[3],  // replacement for that snippet only
      language: defaultLang,
      status: "pending",
    });
    text = text.replace(match[0], `\`${match[1].trim()}\``);
  }

  // Legacy format (AI returned full file in a code fence) — kept for backward compat.
  // [CHANGE_FILE: src/path/file.ext]\n```lang\ncode\n```
  const changeFileLegacyRegex = /\[CHANGE_FILE:\s*([^\]]+)\]\s*\n```(\w+)?\n([\s\S]*?)```/g;
  while ((match = changeFileLegacyRegex.exec(content)) !== null) {
    // Only add if we haven't already parsed this path as a patch above
    const alreadyParsed = proposedChanges.some(c => c.targetPath === match![1].trim() && !c.isNew);
    if (!alreadyParsed) {
      proposedChanges.push({
        id: generateId(),
        targetPath: match[1].trim(),
        isNew: false,
        // No findBlock → apply as full-file replacement (legacy behaviour)
        newContent: match[3].trim(),
        language: match[2] || defaultLang,
        status: "pending",
      });
    }
    text = text.replace(match[0], `\`${match[1].trim()}\``);
  }

  // [NEW_FILE: src/path/file.ext, language]\n```lang\ncode\n```
  const newFileTagRegex = /\[NEW_FILE:\s*([^\],]+),?\s*([^\]]*)\]\s*\n```(\w+)?\n([\s\S]*?)```/g;
  while ((match = newFileTagRegex.exec(content)) !== null) {
    proposedChanges.push({
      id: generateId(),
      targetPath: match[1].trim(),
      isNew: true,
      newContent: match[4].trim(),
      language: match[2]?.trim() || match[3] || defaultLang,
      status: "pending",
    });
    text = text.replace(match[0], `\`${match[1].trim()}\``);
  }

  // Plain code blocks without any tag → target the active file.
  // These are typically short AI suggestions (fix/refactor/explain actions).
  text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (full, lang, code) => {
    if (code.trim().split("\n").length >= 5) {
      proposedChanges.push({
        id: generateId(),
        targetPath: "",
        isNew: false,
        newContent: code.trim(),
        language: lang || defaultLang,
        status: "pending",
      });
      return "";
    }
    return full;
  });

  return { text: text.trim(), actions, proposedChanges };
};

const getConversationTitle = (prompt: string) => prompt.replace(/\s+/g, " ").trim().slice(0, 56) || "New chat";

const usePanelConversations = (scope: string) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  const reload = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setConversations([]);
      return;
    }

    const { data, error } = await supabase
      .from("ai_conversations" as any)
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .eq("project_id", scope)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Failed to load conversations", error);
      return;
    }

    setConversations(
      ((data as any[]) || []).map((item) => ({
        id: item.id,
        title: item.title,
        updatedAt: new Date(item.updated_at),
      }))
    );
  }, [scope]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createConversation = useCallback(async (title: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("ai_conversations" as any)
      .insert({ user_id: user.id, title: getConversationTitle(title), project_id: scope } as any)
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create conversation", error);
      return null;
    }

    await reload();
    return (data as any)?.id as string | null;
  }, [reload, scope]);

  const persistMessage = useCallback(async (conversationId: string, role: Message["role"], content: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from("ai_messages" as any).insert({
      conversation_id: conversationId,
      user_id: user.id,
      role,
      content,
    } as any);

    if (error) {
      console.error("Failed to persist message", error);
      return false;
    }

    await supabase
      .from("ai_conversations" as any)
      .update({ updated_at: new Date().toISOString() } as any)
      .eq("id", conversationId);

    await reload();
    return true;
  }, [reload]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("ai_messages" as any)
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load messages", error);
      return [] as Message[];
    }

    return ((data as any[]) || []).map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      timestamp: new Date(item.created_at),
    }));
  }, []);

  const deleteConversation = useCallback(async (conversationId: string) => {
    const { error } = await supabase.from("ai_conversations" as any).delete().eq("id", conversationId);
    if (error) {
      console.error("Failed to delete conversation", error);
      return false;
    }
    await reload();
    return true;
  }, [reload]);

  return { conversations, reload, createConversation, persistMessage, loadMessages, deleteConversation };
};

// ==================== GEMINI VISION (frontend direct call) ====================

const BUILDFORGE_VISION_SYSTEM = `You are BuildForge AI — a full-stack React/TypeScript application generator and coding assistant.
The user has attached an image. Analyze it carefully and respond to their request.
Common requests: generate code matching a UI mockup, analyze a screenshot, recreate a layout, understand a diagram.
When generating code: use React + TypeScript + Tailwind CSS. Use [CHANGE_FILE:] or [NEW_FILE:] tags when editing/creating files.`;

const CODEFORGE_VISION_SYSTEM = `You are CodeForge AI — a code assistant that can see images.
The user may have attached a design mockup, screenshot, diagram, or reference image.
Analyze the image carefully alongside their current code and provide specific, actionable code suggestions.
Use [CHANGE_FILE:] with [FIND]/[REPLACE] blocks when suggesting edits to existing files.`;


// ==================== INTENT DETECTION ====================

const detectBuildIntent = (prompt: string): boolean => {
  const lower = prompt.toLowerCase().trim();
  if (!lower) return false;
  if (lower.endsWith("?")) return false;
  const conversationalRe = /^(what |why |how |when |where |who |which |can you|could you|is |are |do |does |tell me|explain|describe|hi |hey |hello|thanks|thank |salom|assalom|nima |qanday |nega |qani )/i;
  if (conversationalRe.test(lower)) return false;
  if (/^(hi|hey|hello|thanks|salom|yo|ok|okay|yep|nope|yes|no|sure|nice|great)$/.test(lower)) return false;
  return true;
};

// ==================== IMAGE ATTACH HOOK (shared by BuildForge + CodeForge) ====================

const useImageAttach = (toast: ReturnType<typeof useToast>["toast"]) => {
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Faqat rasmlar qo'shish mumkin", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Rasm 5MB dan kichik bo'lishi kerak (maksimal 5MB)", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setAttachedImage({ base64, mimeType: file.type, previewUrl: URL.createObjectURL(file) });
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const clearImage = useCallback(() => {
    setAttachedImage(prev => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  // Paste handler for onPaste prop on the Input (avoids window listener conflicts between panels)
  const handlePasteEvent = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => i.type.startsWith("image/"));
    if (imgItem) {
      e.preventDefault();
      const f = imgItem.getAsFile();
      if (f) handleImageFile(f);
    }
  }, [handleImageFile]);

  const dragHandlers = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); },
    onDragLeave: () => setIsDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleImageFile(f);
    },
  };

  return { attachedImage, isDragging, fileInputRef, handleImageFile, clearImage, handlePasteEvent, dragHandlers };
};

// Shared image thumbnail UI used by both panels
const ImageThumbnail = ({ image, onClear }: { image: AttachedImage; onClear: () => void }) => (
  <div className="mb-1.5 flex items-center gap-1.5">
    <div className="relative flex-shrink-0">
      <img src={image.previewUrl} alt="Attached" className="h-10 w-10 rounded-md object-cover border border-border/40" />
      <button
        type="button"
        onClick={onClear}
        className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive flex items-center justify-center hover:bg-destructive/80 transition-colors"
      >
        <X className="h-2.5 w-2.5 text-destructive-foreground" />
      </button>
    </div>
    <span className="text-[10px] text-muted-foreground/60 truncate">Rasm biriktirildi</span>
  </div>
);

// ==================== BUILDFORGE AI PANEL ====================

const BuildForgePanel = ({ roomId, code, language, files, activeFile, onCreateFile, onBatchCreateFiles, onRefreshFiles, onUpdateFileContent, projectName }: {
  roomId: string;
  code: string; language: string; files: FileItem[]; activeFile: FileItem | null;
  onCreateFile: WorkspacePanelProps["onCreateFile"];
  onBatchCreateFiles?: WorkspacePanelProps["onBatchCreateFiles"];
  onRefreshFiles?: WorkspacePanelProps["onRefreshFiles"];
  onUpdateFileContent: WorkspacePanelProps["onUpdateFileContent"];
  projectName?: string;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { conversations, createConversation, persistMessage, loadMessages } = usePanelConversations(`${roomId}:buildforge`);
  const { attachedImage, isDragging, fileInputRef, handleImageFile, clearImage, handlePasteEvent, dragHandlers } = useImageAttach(toast);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0 || currentConversationId || conversations.length === 0) return;
    void loadMessages(conversations[0].id).then((loaded) => {
      if (loaded.length > 0) {
        setMessages(loaded);
        setCurrentConversationId(conversations[0].id);
      }
    });
  }, [conversations, currentConversationId, loadMessages, messages.length]);

  const generateProject = useCallback(async (prompt: string, imageData?: AttachedImage) => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = await createConversation(prompt);
      if (conversationId) setCurrentConversationId(conversationId);
    }

    const userMsg: Message = { id: generateId(), role: "user", content: prompt, timestamp: new Date() };
    const loadingMsg: Message = { id: generateId(), role: "assistant", content: "⏳ **Loyiha generatsiya qilinmoqda...**\n\nFayllar yaratilmoqda, biroz kuting.", timestamp: new Date() };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    if (conversationId) await persistMessage(conversationId, "user", prompt);

    try {
      // If the project already has files, tell the AI to ADD to them, not recreate.
      const existingNonFolders = files.filter(f => !f.is_folder);
      const existingContext = existingNonFolders.length > 0
        ? `\n\nThe project already contains these files:\n${existingNonFolders.map(f => `  ${f.path}${f.name}`).join('\n')}\nAdd to the existing project. Do NOT regenerate files that already exist.`
        : '';
      const apiPrompt = prompt + existingContext;

      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          prompt: apiPrompt, code: "", language: "tsx", mode: "generate-project", projectName,
          ...(imageData ? { imageData: { base64: imageData.base64, mimeType: imageData.mimeType } } : {}),
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const responseText = data?.response || "[]";
      let genFiles = normalizeGeneratedProjectFiles(responseText);

      if (genFiles.length === 0) {
        throw new Error("AI hech qanday fayl yaratmadi. Boshqacharoq prompt yozing.");
      }

      // ── Self-correction: detect dangling relative imports and ask AI to fill them ──
      const dangling = findDanglingImports(genFiles);
      if (dangling.length > 0) {
        // Deduplicate by resolved path
        const missingPaths = [...new Set(dangling.map(d => d.resolvedBase))];

        setMessages(prev => prev.map(m => m.id === loadingMsg.id ? {
          ...m,
          content: `⏳ **${missingPaths.length} ta yetishmayotgan fayl topildi, to'ldirmoqda...**\n\n${missingPaths.map(p => `• \`${p}\``).join("\n")}`,
        } : m));

        const fixPrompt = [
          `The project you just generated has ${missingPaths.length} missing local files that are imported but not created.`,
          `Generate ONLY these missing files as a JSON array (same format as before — array of {name, path, language, content} objects):`,
          missingPaths.map(p => {
            // Find who imports it for context
            const ref = dangling.find(d => d.resolvedBase === p);
            return `- ${p}  (imported in ${ref?.importer ?? "?"} as '${ref?.spec ?? "?"}')`;
          }).join("\n"),
          `\nOriginal project request: "${prompt}"`,
          `Make each file complete and self-contained. Do NOT re-generate files that already exist.`,
        ].join("\n");

        const { data: fixData, error: fixErr } = await supabase.functions.invoke("ai-assistant", {
          body: { prompt: fixPrompt, code: "", language: "tsx", mode: "generate-project" },
        });

        if (!fixErr && fixData?.response) {
          const fixFiles = normalizeGeneratedProjectFiles(fixData.response || "[]");
          // Merge: existing files take priority; only add truly new ones
          const existingKeys = new Set(genFiles.map(f => `${f.path}${f.name}`));
          for (const ff of fixFiles) {
            if (!existingKeys.has(`${ff.path}${ff.name}`)) {
              genFiles = [...genFiles, ff];
              existingKeys.add(`${ff.path}${ff.name}`);
            }
          }
        }
      }

      // ── Auto-fix default/named export-import mismatches (prevents "got: undefined" crash) ──
      genFiles = fixExportImportMismatches(genFiles);

      // ── Build proposal ──
      const nonFolders = genFiles.filter(f => !f.is_folder);
      const fileListPreview = nonFolders
        .slice(0, 25)
        .map(f => `\`${(f.path || "/") + f.name}\``)
        .join("\n");
      const moreNote = nonFolders.length > 25 ? `\n...va yana ${nonFolders.length - 25} ta fayl` : "";

      // Show any still-dangling imports as a warning (after self-correction)
      const stillDangling = findDanglingImports(genFiles);
      const warningNote = stillDangling.length > 0
        ? `\n\n⚠️ **${stillDangling.length} ta import hali ham yetishmayapti:**\n${[...new Set(stillDangling.map(d => `• \`${d.spec}\` in \`${d.importer}\``))].slice(0, 8).join("\n")}`
        : "";

      const proposalContent = `🎯 **${nonFolders.length} ta fayl tayyor!**\n\nQuyidagi fayllarni yarataman:\n\n${fileListPreview}${moreNote}${warningNote}\n\n**"Loyihani yaratish"** tugmasini bosib tasdiqlang.`;

      setMessages(prev => prev.map(m => m.id === loadingMsg.id ? {
        ...m,
        content: proposalContent,
        generatedFiles: genFiles,
      } : m));
      if (conversationId) await persistMessage(conversationId, "assistant", proposalContent);
    } catch (err: any) {
      const errorMessage = `❌ **Xatolik**: ${err?.message || "Noma'lum xato"}`;
      setMessages(prev => prev.map(m => m.id === loadingMsg.id ? { ...m, content: errorMessage } : m));
      if (conversationId) await persistMessage(conversationId, "assistant", errorMessage);
      toast({ title: "Xatolik", description: err?.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, toast, projectName, createConversation, currentConversationId, persistMessage, setCurrentConversationId]);

  const loadConversation = useCallback(async (conversationId: string) => {
    const loaded = await loadMessages(conversationId);
    setMessages(loaded);
    setCurrentConversationId(conversationId);
    setShowHistory(false);
  }, [loadMessages]);

  const handleApproveProject = useCallback(async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg?.generatedFiles?.length) return;

    const genFiles = msg.generatedFiles;
    setMessages(prev => prev.map(m => m.id === msgId ? {
      ...m,
      generatedFiles: undefined,
      content: m.content.split("\n\n**\"Loyihani yaratish\"**")[0] + "\n\n⏳ Fayllar yaratilmoqda...",
    } : m));

    const entries = genFiles.map(f => ({
      name: f.name,
      path: f.path || "/",
      isFolder: !!f.is_folder,
      language: f.language || "tsx",
      content: f.content || "",
    }));

    let count = 0;
    let failedNames: string[] = [];

    if (onBatchCreateFiles) {
      const result = await onBatchCreateFiles(entries);
      count = result.created.length;
      failedNames = result.failedNames;
      // Re-fetch from DB so explorer state is 100% consistent (folders + files)
      await onRefreshFiles?.();
    } else {
      // Fallback: sequential (for environments where batch isn't wired up)
      const knownFolders = new Set(files.filter(f => f.is_folder).map(f => `${f.path}${f.name}/`));
      for (const folder of collectGeneratedFolders(genFiles)) {
        const key = `${folder.path}${folder.name}/`;
        if (knownFolders.has(key)) continue;
        const created = await onCreateFile(folder.name, folder.path, true);
        if (created) knownFolders.add(key);
      }
      for (const file of genFiles) {
        if (!file.is_folder && file.name) {
          const created = await onCreateFile(file.name, file.path || "/", false, file.language || "tsx", file.content || "");
          if (created) count++; else failedNames.push(file.name);
        }
      }
    }

    const failNote = failedNames.length > 0 ? `\n\n⚠️ ${failedNames.length} fayl yaratilmadi.` : "";
    const fileList = genFiles.filter(f => !f.is_folder).map(f => `\`${(f.path || "/") + f.name}\``).join("\n");
    const done = `✅ **Loyiha yaratildi!** ${count} ta fayl muvaffaqiyatli qo'shildi.\n\n${fileList}\n\n👁 Preview tugmasini bosing!${failNote}`;
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: done } : m));
    toast({ title: "Loyiha yaratildi!", description: `${count} ta fayl` });
  }, [messages, files, onCreateFile, onBatchCreateFiles, onRefreshFiles, toast]);

  const handleRejectProject = useCallback((msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? {
      ...m,
      generatedFiles: undefined,
      content: m.content.split("\n\n**\"Loyihani yaratish\"**")[0] + "\n\n❌ Bekor qilindi.",
    } : m));
  }, []);

  const handleBuildForgeProposedChange = useCallback(async (
    msgId: string,
    changeId: string,
    accept: boolean,
  ) => {
    if (!accept) {
      setMessages(prev => prev.map(m => m.id === msgId ? {
        ...m,
        proposedChanges: m.proposedChanges?.map(c =>
          c.id === changeId ? { ...c, status: "rejected" as const } : c
        ),
      } : m));
      return;
    }
    const msg = messages.find(m => m.id === msgId);
    const change = msg?.proposedChanges?.find(c => c.id === changeId);
    if (!change) return;

    const applyToFile = (fileId: string, currentContent: string, fileName: string) => {
      if (change.findBlock !== undefined) {
        const patched = currentContent.replace(change.findBlock, change.newContent);
        if (patched === currentContent) {
          toast({ title: "⚠️ O'zgartirish topilmadi", description: `"${fileName}" faylida kod topilmadi.`, variant: "destructive" });
          return;
        }
        onUpdateFileContent(fileId, patched);
        toast({ title: "Patch qo'llanildi", description: fileName });
      } else {
        onUpdateFileContent(fileId, change.newContent);
        toast({ title: "O'zgartirish qo'llanildi", description: fileName });
      }
    };

    if (!change.targetPath && activeFile) {
      // Use `code` (live editor content) not stale activeFile.content from state.
      applyToFile(activeFile.id, code, activeFile.name);
    } else if (!change.targetPath) {
      toast({ title: "Xatolik", description: "Iltimos, avval fayl tanlang", variant: "destructive" });
      return;
    } else {
      const targetNormalized = change.targetPath.replace(/^\/+/, "");
      const existingFile = files.find(f => `${f.path}${f.name}`.replace(/^\/+/, "") === targetNormalized);
      if (existingFile) {
        // If this is the active file, use live editor content to avoid stale-state patches.
        const currentContent = existingFile.id === activeFile?.id ? code : existingFile.content;
        applyToFile(existingFile.id, currentContent, change.targetPath);
      } else {
        const parts = targetNormalized.split("/");
        const name = parts.pop() || change.targetPath;
        const folderPath = parts.length > 0 ? `/${parts.join("/")}/` : "/";
        await onCreateFile(name, folderPath, false, change.language, change.newContent);
        toast({ title: "Fayl yaratildi", description: change.targetPath });
      }
    }

    setMessages(prev => prev.map(m => m.id === msgId ? {
      ...m,
      proposedChanges: m.proposedChanges?.map(c =>
        c.id === changeId ? { ...c, status: "accepted" as const } : c
      ),
    } : m));
  }, [messages, files, activeFile, code, onCreateFile, onUpdateFileContent, toast]);

  const sendBuildForgeChat = useCallback(async (prompt: string, imageData?: AttachedImage) => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = await createConversation(prompt);
      if (conversationId) setCurrentConversationId(conversationId);
    }

    const userMsg: Message = { id: generateId(), role: "user", content: prompt, timestamp: new Date() };
    const assistantId = generateId();
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: "assistant", content: "", timestamp: new Date() }]);
    if (conversationId) await persistMessage(conversationId, "user", prompt);

    try {
      const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));

      // Build file context so AI knows what already exists — injected into the API prompt
      // but NOT saved into conversation history (keeps DB clean).
      const existingNonFolders = files.filter(f => !f.is_folder);
      const fileContextBlock = existingNonFolders.length > 0
        ? `\n\n---\nProject already contains ${existingNonFolders.length} file(s):\n${existingNonFolders.map(f => `  ${f.path}${f.name}`).join('\n')}\nUse exact paths in [CHANGE_FILE:] for edits. Use [NEW_FILE:] only for truly new files. Do NOT recreate existing files.\n---`
        : '';
      const apiPrompt = prompt + fileContextBlock;

      // Images are sent to the edge function (Lovable AI Gateway multimodal).


      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Sessiya topilmadi. Qayta kiring.");

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          prompt: apiPrompt,
          code: "",
          language: "tsx",
          messages: chatHistory,
          mode: "buildforge-chat",
          ...(imageData ? { imageData: { base64: imageData.base64, mimeType: imageData.mimeType } } : {}),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).error || `HTTP ${response.status}`);
      }

      let assistantContent = "";
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                assistantContent += delta;
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m));
              }
            } catch { /* skip malformed SSE chunk */ }
          }
        }
      } else {
        const data = await response.json();
        assistantContent = (data as any).response || (data as any).error || "Javob yo'q";
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m));
      }

      const { text, proposedChanges } = parseAIResponse(assistantContent, "tsx");
      setMessages(prev => prev.map(m => m.id === assistantId ? {
        ...m, content: text,
        proposedChanges: proposedChanges.length > 0 ? proposedChanges : undefined,
      } : m));

      if (conversationId) await persistMessage(conversationId, "assistant", text);
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `❌ **Xatolik**: ${err?.message}` } : m));
      toast({ title: "Xatolik", description: err?.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, currentConversationId, createConversation, persistMessage, messages, toast, setCurrentConversationId]);

  const sendBuildForgeMessage = useCallback(async (prompt: string) => {
    const effective = prompt.trim();
    if ((!effective && !attachedImage) || isGenerating) return;
    const imgToSend = attachedImage ?? undefined;
    clearImage();
    const finalPrompt = effective || "Ushbu rasmni tahlil qil";

    if (detectBuildIntent(finalPrompt)) {
      await generateProject(finalPrompt, imgToSend);
    } else {
      await sendBuildForgeChat(finalPrompt, imgToSend);
    }
  }, [isGenerating, attachedImage, clearImage, generateProject, sendBuildForgeChat]);

  return (
    <div className="flex flex-col h-full">
      {/* BuildForge header */}
      <div className="flex items-center justify-between border-b border-border/40 px-2.5 h-7 flex-shrink-0 bg-card/50">
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-4 rounded bg-primary/12 border border-primary/18 flex items-center justify-center flex-shrink-0">
            <Rocket className="h-2.5 w-2.5 text-primary" />
          </div>
          <p className="text-[11px] font-semibold tracking-tight text-foreground/85">BuildForge AI</p>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => { setMessages([]); setCurrentConversationId(null); }} className="rounded p-1 hover:bg-white/[0.06] transition-colors" title="New chat">
            <Plus className="h-3 w-3 text-muted-foreground/55" />
          </button>
          <button type="button" onClick={() => setShowHistory((prev) => !prev)} className="relative rounded p-1 hover:bg-white/[0.06] transition-colors" title="History">
            <History className="h-3 w-3 text-muted-foreground/55" />
            {conversations.length > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-primary px-0.5 text-[7px] text-primary-foreground font-semibold">{conversations.length}</span>}
          </button>
        </div>
      </div>
      {showHistory && (
        <div className="max-h-28 space-y-0.5 overflow-y-auto border-b border-border/40 px-2 py-1.5 bg-background/25">
          {conversations.length === 0
            ? <p className="text-[10px] text-muted-foreground/45 py-1 text-center">No saved chats</p>
            : conversations.map((conversation) => (
              <button key={conversation.id} type="button" onClick={() => void loadConversation(conversation.id)} className="flex w-full items-center justify-between rounded-lg border border-border/30 bg-muted/15 px-2.5 py-1.5 text-left hover:bg-muted/30 hover:border-border/45 transition-all">
                <span className="truncate text-[10px] text-foreground/70 font-medium">{conversation.title}</span>
                <span className="ml-2 shrink-0 text-[9px] text-muted-foreground/40">{conversation.updatedAt.toLocaleDateString()}</span>
              </button>
            ))}
        </div>
      )}
      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-6 px-4">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/18 flex items-center justify-center mb-2 shadow-[0_0_16px_hsl(var(--primary)/0.10)]">
              <Rocket className="h-3.5 w-3.5 text-primary/70" />
            </div>
            <h4 className="font-semibold text-[12px] mb-1 tracking-tight">BuildForge AI</h4>
            <p className="text-[10px] text-muted-foreground/55 max-w-[190px] leading-relaxed">Generate complete projects from a single prompt.</p>
            <div className="flex flex-col gap-1 mt-3 w-full max-w-[230px]">
              {BUILDFORGE_STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => { setInput(starter); void sendBuildForgeMessage(starter); }}
                  className="suggestion-chip"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className={cn("flex gap-2", msg.role === "user" && "flex-row-reverse")}>
                <Avatar className="h-5 w-5 flex-shrink-0">
                  <AvatarFallback className={cn("text-[9px]", msg.role === "user" ? "bg-primary/25 text-primary" : "bg-muted text-muted-foreground")}>
                    {msg.role === "user" ? "U" : <Rocket className="h-2.5 w-2.5" />}
                  </AvatarFallback>
                </Avatar>
                <div className={cn("flex-1 min-w-0 max-w-full overflow-hidden px-2.5 py-2 rounded-lg text-xs", msg.role === "user" ? "bg-primary/18 border border-primary/22" : "bg-muted/50 border border-border/50")}>
                  {msg.role === "assistant" ? (
                    <>
                      <MarkdownContent content={msg.content} language={language} />
                      {msg.generatedFiles && msg.generatedFiles.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-[10px] px-3 bg-emerald-700 hover:bg-emerald-600 text-white gap-1.5 border-0"
                            onClick={() => void handleApproveProject(msg.id)}
                          >
                            <PackagePlus className="h-3 w-3" />
                            Loyihani yaratish ({msg.generatedFiles.filter(f => !f.is_folder).length} fayl)
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2 gap-1"
                            onClick={() => handleRejectProject(msg.id)}
                          >
                            <X className="h-3 w-3" /> Bekor
                          </Button>
                        </div>
                      )}
                      {msg.proposedChanges && msg.proposedChanges.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {msg.proposedChanges.map(change => {
                            const resolvedPath = change.targetPath ||
                              (activeFile ? `${activeFile.path}${activeFile.name}`.replace(/^\/+/, "") : "");
                            const existingFile = resolvedPath
                              ? files.find(f => `${f.path}${f.name}`.replace(/^\/+/, "") === resolvedPath)
                              : activeFile ?? undefined;
                            return (
                              <ProposedChangeCard
                                key={change.id}
                                filePath={resolvedPath}
                                oldContent={change.findBlock !== undefined ? change.findBlock : (existingFile?.content ?? "")}
                                newContent={change.newContent}
                                isNew={change.isNew}
                                status={change.status}
                                onAccept={() => void handleBuildForgeProposedChange(msg.id, change.id, true)}
                                onReject={() => void handleBuildForgeProposedChange(msg.id, change.id, false)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
            {isGenerating && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-2">
                <Avatar className="h-5 w-5"><AvatarFallback className="bg-muted text-muted-foreground"><Rocket className="h-2.5 w-2.5" /></AvatarFallback></Avatar>
                <div className="px-3 py-2 rounded-xl bg-muted/50 border border-border/45">
                  <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin text-primary" /><span className="text-[10px] text-muted-foreground/70">Generating...</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
      <div
        className={cn("px-2 py-1.5 border-t border-border/40 bg-card/30 transition-colors", isDragging && "bg-primary/5 border-primary/30")}
        {...dragHandlers}
      >
        {attachedImage && <ImageThumbnail image={attachedImage} onClear={clearImage} />}
        <form onSubmit={(e) => { e.preventDefault(); void sendBuildForgeMessage(input); setInput(""); }} className="flex gap-1">
          <Input value={input} onChange={e => setInput(e.target.value)} onPaste={handlePasteEvent} placeholder="Loyiha yoki savol..." className="flex-1 h-7 text-[11px] bg-background/50 border-border/45 focus-visible:ring-0 focus-visible:border-primary/55 placeholder:text-muted-foreground/40 rounded-md" disabled={isGenerating} />
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }} />
          <Button type="button" size="sm" variant="outline" className="h-7 w-7 p-0 shrink-0 rounded-md border-border/45" disabled={isGenerating} onClick={() => fileInputRef.current?.click()} title="Rasm biriktirish">
            <Paperclip className="h-3 w-3" />
          </Button>
          <Button type="submit" size="sm" className="h-7 w-7 p-0 shrink-0 rounded-md" disabled={isGenerating || (!input.trim() && !attachedImage)}>
            {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
          </Button>
        </form>
      </div>
    </div>
  );
};

// ==================== CODEFORGE AI PANEL ====================

const CodeForgePanel = ({ code, language, files, activeFile, onCreateFile, onUpdateFileContent, projectName }: {
  code: string; language: string; files: FileItem[]; activeFile: FileItem | null;
  onCreateFile: WorkspacePanelProps["onCreateFile"]; onUpdateFileContent: WorkspacePanelProps["onUpdateFileContent"];
  projectName?: string;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { attachedImage, isDragging, fileInputRef, handleImageFile, clearImage, handlePasteEvent, dragHandlers } = useImageAttach(toast);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = useCallback(async (prompt: string, imageData?: AttachedImage) => {
    if ((!prompt.trim() && !imageData) || isLoading) return;
    setIsLoading(true);
    const effectivePrompt = prompt.trim() || "Ushbu rasmni tahlil qil";

    const userMsg: Message = { id: generateId(), role: "user", content: effectivePrompt, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      // Build file list context for AI — injected into API prompt, NOT saved to history.
      const otherFiles = files.filter(f => !f.is_folder && f.name !== activeFile?.name);
      const fileListCtx = otherFiles.length > 0
        ? `\n\nOther project files:\n${otherFiles.map(f => `  ${f.path}${f.name}`).join('\n')}`
        : '';
      const activeFileLabel = activeFile ? `\n\nCurrent file: ${activeFile.path}${activeFile.name}` : '';
      const apiPrompt = effectivePrompt + activeFileLabel + fileListCtx;

      // Images are sent to the edge function (Lovable AI Gateway multimodal).


      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("Iltimos, qayta tizimga kiring (sessiya topilmadi).");
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          prompt: `${apiPrompt}\n\nCurrent code:\n\`\`\`${language}\n${code}\n\`\`\``,
          code,
          language,
          messages: chatHistory,
          ...(imageData ? { imageData: { base64: imageData.base64, mimeType: imageData.mimeType } } : {}),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && response.body) {
        let assistantContent = "";
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const assistantId = generateId();

        setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: new Date() }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                assistantContent += delta;
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m));
              }
            } catch { /* skip */ }
          }
        }

        const { text, actions, proposedChanges } = parseAIResponse(assistantContent, language);
        setMessages(prev => prev.map(m => m.id === assistantId ? {
          ...m,
          content: text,
          actions: actions.length > 0 ? actions : undefined,
          proposedChanges: proposedChanges.length > 0 ? proposedChanges : undefined,
        } : m));
      } else {
        const data = await response.json();
        const responseText = data.response || data.error || "Javob yo'q";
        const { text, actions, proposedChanges } = parseAIResponse(responseText, language);
        setMessages(prev => [...prev, {
          id: generateId(), role: "assistant", content: text, timestamp: new Date(),
          actions: actions.length > 0 ? actions : undefined,
          proposedChanges: proposedChanges.length > 0 ? proposedChanges : undefined,
        }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: generateId(), role: "assistant", content: `❌ **Xatolik**: ${err?.message}`, timestamp: new Date() }]);
      toast({ title: "Xatolik", description: err?.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, code, language, toast]);

  const handleAction = useCallback(async (action: AIAction) => {
    if (action.type === "create_file" && action.name && action.path) {
      await onCreateFile(action.name, action.path, false, action.language, action.content || "");
      toast({ title: "Fayl yaratildi", description: action.name });
    } else if (action.type === "create_folder" && action.name && action.path) {
      await onCreateFile(action.name, action.path, true);
      toast({ title: "Papka yaratildi", description: action.name });
    }
  }, [onCreateFile, onUpdateFileContent, activeFile, toast]);

  const handleProposedChange = useCallback(async (
    msgId: string,
    changeId: string,
    accept: boolean,
  ) => {
    if (!accept) {
      setMessages(prev => prev.map(m => m.id === msgId ? {
        ...m,
        proposedChanges: m.proposedChanges?.map(c =>
          c.id === changeId ? { ...c, status: "rejected" as const } : c
        ),
      } : m));
      return;
    }

    const msg = messages.find(m => m.id === msgId);
    const change = msg?.proposedChanges?.find(c => c.id === changeId);
    if (!change) return;

    // Helper: apply the change to a file — patch mode if findBlock present, else full replace.
    const applyToFile = (fileId: string, currentContent: string, fileName: string) => {
      if (change.findBlock !== undefined) {
        // Patch mode: find the exact snippet and replace only that section.
        const patched = currentContent.replace(change.findBlock, change.newContent);
        if (patched === currentContent) {
          // FIND block not found in file — warn and skip to avoid silently losing content.
          toast({
            title: "⚠️ O'zgartirish topilmadi",
            description: `"${fileName}" faylida qidirilgan kod topilmadi. Iltimos qo'lda tekshiring.`,
            variant: "destructive",
          });
          return;
        }
        onUpdateFileContent(fileId, patched);
        toast({ title: "Patch qo'llanildi", description: fileName });
      } else {
        // Legacy full-file replacement (no findBlock).
        onUpdateFileContent(fileId, change.newContent);
        toast({ title: "O'zgartirish qo'llanildi", description: fileName });
      }
    };

    // targetPath="" means "apply to the currently active file"
    if (!change.targetPath && activeFile) {
      // Use `code` (live editor content) not stale activeFile.content.
      applyToFile(activeFile.id, code, activeFile.name);
    } else if (!change.targetPath) {
      toast({ title: "Xatolik", description: "Iltimos, avval fayl tanlang", variant: "destructive" });
      return;
    } else {
      const targetNormalized = change.targetPath.replace(/^\/+/, "");
      const existingFile = files.find(f =>
        `${f.path}${f.name}`.replace(/^\/+/, "") === targetNormalized
      );
      if (existingFile) {
        // If this is the active file, use live editor content to avoid stale-state patches.
        const currentContent = existingFile.id === activeFile?.id ? code : existingFile.content;
        applyToFile(existingFile.id, currentContent, change.targetPath);
      } else {
        // File doesn't exist yet — create it with the full newContent.
        const parts = targetNormalized.split("/");
        const name = parts.pop() || change.targetPath;
        const folderPath = parts.length > 0 ? `/${parts.join("/")}/` : "/";
        await onCreateFile(name, folderPath, false, change.language, change.newContent);
        toast({ title: "Fayl yaratildi", description: change.targetPath });
      }
    }

    setMessages(prev => prev.map(m => m.id === msgId ? {
      ...m,
      proposedChanges: m.proposedChanges?.map(c =>
        c.id === changeId ? { ...c, status: "accepted" as const } : c
      ),
    } : m));
  }, [messages, files, activeFile, code, onCreateFile, onUpdateFileContent, toast]);

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-6 px-4">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/18 flex items-center justify-center mb-2 shadow-[0_0_16px_hsl(var(--primary)/0.10)]">
              <Sparkles className="h-3.5 w-3.5 text-primary/70" />
            </div>
            <h4 className="font-semibold text-[12px] mb-1 tracking-tight">CodeForge AI</h4>
            <p className="text-[10px] text-muted-foreground/55 max-w-[180px] leading-relaxed">Ask about the current file, fix bugs, or refactor.</p>
            <div className="grid grid-cols-2 gap-1 mt-3 w-full max-w-[230px]">
              {[
                { icon: Code, label: "Explain code", prompt: "Explain this code in detail" },
                { icon: Bug, label: "Find bugs", prompt: "Find bugs in this code" },
                { icon: Wand2, label: "Refactor", prompt: "Refactor this code" },
                { icon: Sparkles, label: "Optimize", prompt: "Optimize this code" },
              ].map((it, i) => (
                <button key={i} onClick={() => sendMessage(it.prompt)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded border border-border/35 bg-muted/15 text-[10px] text-muted-foreground/65 transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-foreground">
                  <it.icon className="h-3 w-3 flex-shrink-0" />
                  <span>{it.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className="space-y-1">
                <div className={cn("flex gap-2", msg.role === "user" && "flex-row-reverse")}>
                  <Avatar className="h-5 w-5 flex-shrink-0">
                    <AvatarFallback className={cn("text-[9px]", msg.role === "user" ? "bg-primary/25 text-primary" : "bg-muted text-muted-foreground")}>
                      {msg.role === "user" ? "U" : <Bot className="h-2.5 w-2.5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn("flex-1 px-2.5 py-2 rounded-lg text-xs min-w-0 max-w-full overflow-hidden", msg.role === "user" ? "bg-primary/18 border border-primary/22" : "bg-muted/50 border border-border/50")}>
                    {msg.role === "assistant" ? (
                      <>
                        <MarkdownContent content={msg.content} language={language} />
                        {msg.proposedChanges && msg.proposedChanges.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {msg.proposedChanges.filter(c => c.status === "pending").length > 1 && (
                              <div className="flex justify-end mb-1">
                                <Button
                                  size="sm"
                                  className="h-6 text-[10px] px-2.5 bg-emerald-700/90 hover:bg-emerald-600 text-white gap-1 border-0"
                                  onClick={async () => {
                                    const pending = msg.proposedChanges!.filter(c => c.status === "pending");
                                    for (const change of pending) {
                                      await handleProposedChange(msg.id, change.id, true);
                                    }
                                  }}
                                >
                                  <Check className="h-2.5 w-2.5" />
                                  Apply all ({msg.proposedChanges.filter(c => c.status === "pending").length})
                                </Button>
                              </div>
                            )}
                            {msg.proposedChanges.map(change => {
                              const resolvedPath = change.targetPath ||
                                (activeFile ? `${activeFile.path}${activeFile.name}`.replace(/^\/+/, "") : "");
                              const existingFile = resolvedPath
                                ? files.find(f => `${f.path}${f.name}`.replace(/^\/+/, "") === resolvedPath)
                                : activeFile ?? undefined;
                              return (
                                <ProposedChangeCard
                                  key={change.id}
                                  filePath={resolvedPath}
                                  oldContent={
                                    // Patch mode: show only the replaced snippet so diff is compact.
                                    // Legacy/full-replace mode: show full existing file.
                                    change.findBlock !== undefined
                                      ? change.findBlock
                                      : (existingFile?.content ?? "")
                                  }
                                  newContent={change.newContent}
                                  isNew={change.isNew}
                                  status={change.status}
                                  onAccept={() => void handleProposedChange(msg.id, change.id, true)}
                                  onReject={() => void handleProposedChange(msg.id, change.id, false)}
                                />
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</span>
                    )}
                  </div>
                </div>
                {msg.actions && msg.actions.some(a => a.type === "create_file" || a.type === "create_folder") && (
                  <div className="flex flex-wrap gap-1 ml-7">
                    {msg.actions.filter(a => a.type === "create_file" || a.type === "create_folder").map((action, i) => (
                      <button key={i} onClick={() => handleAction(action)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/8 hover:bg-primary/15 border border-primary/18 text-[9px] font-medium text-primary/80 transition-colors">
                        {action.type === "create_file" && <><FilePlus className="h-2.5 w-2.5" /> {action.name}</>}
                        {action.type === "create_folder" && <><FolderPlus className="h-2.5 w-2.5" /> {action.name}</>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-2">
                <Avatar className="h-5 w-5"><AvatarFallback className="bg-muted text-muted-foreground"><Bot className="h-2.5 w-2.5" /></AvatarFallback></Avatar>
                <div className="px-3 py-2 rounded-xl bg-muted/50 border border-border/45">
                  <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin text-primary" /><span className="text-[10px] text-muted-foreground/70">Thinking...</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
      <div
        className={cn("px-2.5 py-2 border-t border-border/40 bg-card/30 transition-colors", isDragging && "bg-primary/5 border-primary/30")}
        {...dragHandlers}
      >
        {attachedImage && <ImageThumbnail image={attachedImage} onClear={clearImage} />}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim() && !attachedImage) return;
            const img = attachedImage ?? undefined;
            clearImage();
            sendMessage(input, img);
            setInput("");
          }}
          className="flex gap-1"
        >
          <Input value={input} onChange={e => setInput(e.target.value)} onPaste={handlePasteEvent} placeholder="Ask CodeForge AI..." className="flex-1 h-7 text-[11px] bg-background/50 border-border/45 focus-visible:ring-0 focus-visible:border-primary/55 placeholder:text-muted-foreground/40 rounded-md" disabled={isLoading} />
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ""; }} />
          <Button type="button" size="sm" variant="outline" className="h-7 w-7 p-0 shrink-0 rounded-md border-border/45" disabled={isLoading} onClick={() => fileInputRef.current?.click()} title="Rasm biriktirish">
            <Paperclip className="h-3 w-3" />
          </Button>
          <Button type="submit" size="sm" className="h-7 w-7 p-0 shrink-0 rounded-md" disabled={isLoading || (!input.trim() && !attachedImage)}>
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </Button>
        </form>
      </div>
    </div>
  );
};

// ==================== TEAM CHAT PANEL ====================

const TeamChatPanel = ({ roomId }: { roomId: string }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [mutedByAdmin, setMutedByAdmin] = useState(false);
  const { user, profile, isAuthenticated } = useAuth();
  const { isUserMuted } = useAdmin();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roomId) return;
    const fetchMessages = async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("room_id", roomId).order("created_at", { ascending: true }).limit(100);
      if (data) {
        const userIds = [...new Set(data.map(m => m.user_id))];
        const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds);
        const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
        setMessages(data.map(msg => ({ ...msg, profile: profileMap.get(msg.user_id) || undefined })));
      }
    };
    fetchMessages();
    const channel = supabase.channel(`workspace-chat:${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const { data: p } = await supabase.from("profiles").select("display_name, avatar_url").eq("user_id", payload.new.user_id).single();
          setMessages(prev => [...prev, { ...(payload.new as any), profile: p || undefined }]);
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!user?.id || !roomId) return;
    const check = async () => setMutedByAdmin(await isUserMuted(user.id, roomId));
    check();
  }, [roomId, user?.id, isUserMuted]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || sending) return;
    if (mutedByAdmin) { toast({ title: "Muted", description: "You are muted in this room.", variant: "destructive" }); return; }
    setSending(true);
    try {
      await supabase.from("chat_messages").insert({ room_id: roomId, user_id: user.id, content: newMessage.trim() });
      setNewMessage("");
    } catch (error) { console.error("Error:", error); }
    finally { setSending(false); }
  };

  const getInitials = (name: string | null | undefined) => name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "?";
  const formatTime = (d: string) => new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-10">
            <div className="h-9 w-9 rounded-xl bg-muted/40 border border-border/35 flex items-center justify-center mb-3">
              <MessageCircle className="h-4 w-4 text-muted-foreground/40" />
            </div>
            <p className="text-[12px] font-medium text-muted-foreground/60">No messages yet</p>
            <p className="text-[10px] text-muted-foreground/40 mt-1">Be the first to say something</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map(msg => {
              const isOwn = msg.user_id === user?.id;
              return (
                <div key={msg.id} className={cn("flex gap-1.5 items-end", isOwn && "flex-row-reverse")}>
                  <Avatar className="h-5 w-5 flex-shrink-0">
                    <AvatarImage src={msg.profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-[8px] bg-muted text-muted-foreground">{getInitials(msg.profile?.display_name)}</AvatarFallback>
                  </Avatar>
                  <div className={cn("max-w-[78%] rounded-xl px-2.5 py-1.5", isOwn ? "bg-primary/85 text-primary-foreground" : "bg-muted/55 border border-border/45")}>
                    {!isOwn && <p className="text-[9px] font-semibold mb-0.5 text-muted-foreground/65">{msg.profile?.display_name || "Anonymous"}</p>}
                    <p className="text-[11px] break-words leading-relaxed">{msg.content}</p>
                    <p className={cn("text-[8px] mt-0.5 tabular-nums", isOwn ? "opacity-45" : "text-muted-foreground/45")}>{formatTime(msg.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
      {isAuthenticated ? (
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="px-2.5 py-2 border-t border-border/40 bg-card/30">
          <div className="flex gap-1.5">
            <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder={mutedByAdmin ? "Muted" : "Type a message..."} className="flex-1 h-8 text-[11px] bg-background/50 border-border/45 focus-visible:ring-0 focus-visible:border-primary/55 placeholder:text-muted-foreground/40 rounded-lg" disabled={sending || mutedByAdmin} />
            <Button type="submit" size="sm" className="h-8 w-8 p-0 shrink-0 rounded-lg" disabled={!newMessage.trim() || sending || mutedByAdmin}>
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </form>
      ) : (
        <div className="px-3 py-2.5 border-t border-border/40 text-center">
          <p className="text-[11px] text-muted-foreground/50">Sign in to chat</p>
        </div>
      )}
    </div>
  );
};

// ==================== MAIN WORKSPACE PANEL ====================

const TABS: { id: TabId; label: string; icon: typeof Rocket }[] = [
  { id: "buildforge", label: "BuildForge AI", icon: Rocket },
  { id: "codeforge", label: "CodeForge AI", icon: Sparkles },
  { id: "chat", label: "Team Chat", icon: MessageCircle },
];

const WorkspacePanel = ({
  isOpen, onToggle, roomId, code, language, files, activeFile,
  onCreateFile, onBatchCreateFiles, onRefreshFiles, onUpdateFileContent, projectName,
}: WorkspacePanelProps) => {
  const [activeTab, setActiveTab] = useState<TabId>("buildforge");

  if (!isOpen) return null;

  return (
    <div className="w-full h-full flex flex-col bg-card border-l border-border/60 overflow-hidden">
      <div className="flex h-8 border-b border-border/45 flex-shrink-0 items-stretch" style={{ background: 'linear-gradient(to bottom, hsl(var(--card) / 0.7), hsl(var(--card) / 0.5))' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 text-[10px] font-medium transition-all duration-150 border-b-2 relative",
              activeTab === tab.id
                ? "border-primary text-foreground bg-background/30"
                : "border-transparent text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/[0.03]"
            )}
          >
            <tab.icon className={cn("h-3 w-3 flex-shrink-0", activeTab === tab.id ? "text-primary" : "text-muted-foreground/50")} />
            <span className="hidden sm:inline truncate">{tab.label}</span>
          </button>
        ))}
        <div className="flex items-center pr-2 pl-1 border-b-2 border-transparent flex-shrink-0">
          <CreditBadge />
        </div>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "buildforge" && (
          <BuildForgePanel roomId={roomId} code={code} language={language} files={files} activeFile={activeFile}
            onCreateFile={onCreateFile} onBatchCreateFiles={onBatchCreateFiles} onRefreshFiles={onRefreshFiles} onUpdateFileContent={onUpdateFileContent} projectName={projectName} />
        )}
        {activeTab === "codeforge" && (
          <CodeForgePanel code={code} language={language} files={files} activeFile={activeFile}
            onCreateFile={onCreateFile} onUpdateFileContent={onUpdateFileContent} projectName={projectName} />
        )}
        {activeTab === "chat" && <TeamChatPanel roomId={roomId} />}
      </div>
    </div>
  );
};

export default WorkspacePanel;
