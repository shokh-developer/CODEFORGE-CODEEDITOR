import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { collectGeneratedFolders, normalizeGeneratedProjectFiles } from "@/lib/ai-json";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Bot, Send, Loader2, Code, Rocket, Sparkles, Wand2,
  MessageCircle, Trash2, FileCode, FilePlus, FolderPlus,
  Bug, Copy, Check, ChevronDown
} from "lucide-react";

// ==================== TYPES ====================

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: AIAction[];
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

interface WorkspacePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  roomId: string;
  code: string;
  language: string;
  files: FileItem[];
  activeFile: FileItem | null;
  onCreateFile: (name: string, path: string, isFolder: boolean, language?: string, content?: string) => Promise<any>;
  onUpdateFileContent: (fileId: string, content: string) => void;
  projectName?: string;
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

const CodeBlock = ({ code, lang, onApply }: { code: string; lang: string; onApply?: () => void }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border/40">
      <div className="flex items-center justify-between px-3 py-1 bg-muted/40 border-b border-border/30">
        <span className="text-[10px] font-mono text-muted-foreground">{lang}</span>
        <div className="flex gap-1">
          <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="p-1 rounded hover:bg-background/60">
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
          </button>
          {onApply && (
            <button onClick={onApply} className="p-1 rounded hover:bg-background/60">
              <FileCode className="h-3 w-3 text-primary" />
            </button>
          )}
        </div>
      </div>
      <SyntaxHighlighter language={lang} style={vscDarkPlus} customStyle={{ margin: 0, fontSize: "11px", padding: "10px" }} showLineNumbers>
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

// ==================== MARKDOWN RENDERER ====================

const MarkdownContent = ({ content, language, onApplyCode }: { content: string; language: string; onApplyCode: (c: string) => void }) => (
  <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed">
    <ReactMarkdown
      components={{
        code({ className, children }) {
          const match = /language-(\w+)/.exec(className || "");
          const codeStr = String(children).replace(/\n$/, "");
          if (match) return <CodeBlock code={codeStr} lang={match[1]} onApply={() => onApplyCode(codeStr)} />;
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

const parseAIResponse = (content: string, language: string): { text: string; actions: AIAction[] } => {
  const actions: AIAction[] = [];
  let text = content;

  const createFileRegex = /\[CREATE_FILE:\s*([^\],]+),\s*([^\],]+),\s*([^\]]+)\]/gi;
  let match;
  while ((match = createFileRegex.exec(content)) !== null) {
    actions.push({ type: "create_file", name: match[1].trim(), path: match[2].trim(), language: match[3].trim() });
  }
  text = text.replace(createFileRegex, "");

  const createFolderRegex = /\[CREATE_FOLDER:\s*([^\],]+),\s*([^\]]+)\]/gi;
  while ((match = createFolderRegex.exec(content)) !== null) {
    actions.push({ type: "create_folder", name: match[1].trim(), path: match[2].trim() });
  }
  text = text.replace(createFolderRegex, "");

  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    actions.push({ type: "apply_code", content: match[2].trim(), language: match[1] || language });
  }

  return { text: text.trim(), actions };
};

// ==================== BUILDFORGE AI PANEL ====================

const BuildForgePanel = ({ code, language, files, activeFile, onCreateFile, onUpdateFileContent, projectName }: {
  code: string; language: string; files: FileItem[]; activeFile: FileItem | null;
  onCreateFile: WorkspacePanelProps["onCreateFile"]; onUpdateFileContent: WorkspacePanelProps["onUpdateFileContent"];
  projectName?: string;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const generateProject = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);

    const userMsg: Message = { id: generateId(), role: "user", content: prompt, timestamp: new Date() };
    const loadingMsg: Message = { id: generateId(), role: "assistant", content: "⏳ **Loyiha generatsiya qilinmoqda...**\n\nFayllar yaratilmoqda, biroz kuting.", timestamp: new Date() };
    setMessages(prev => [...prev, userMsg, loadingMsg]);

    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { prompt, code: "", language: "tsx", mode: "generate-project", projectName },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const responseText = data?.response || "[]";
      const generatedFiles = normalizeGeneratedProjectFiles(responseText);
      const knownFolders = new Set(files.filter(f => f.is_folder).map(f => `${f.path}${f.name}/`));

      for (const folder of collectGeneratedFolders(generatedFiles)) {
        const folderKey = `${folder.path}${folder.name}/`;
        if (knownFolders.has(folderKey)) continue;
        await onCreateFile(folder.name, folder.path, true);
        knownFolders.add(folderKey);
      }

      let count = 0;
      for (const file of generatedFiles) {
        if (!file.is_folder && file.name) {
          await onCreateFile(file.name, file.path || "/", false, file.language || "tsx", file.content);
          count++;
        }
      }

      setMessages(prev => prev.map(m => m.id === loadingMsg.id ? {
        ...m, content: `✅ **Loyiha yaratildi!**\n\n${count} ta fayl:\n${generatedFiles.map((f: any) => `- 📄 \`${f.path || "/"}${f.name}\``).join("\n")}\n\n👁 Preview tugmasini bosib natijani ko'ring!`
      } : m));
      toast({ title: "Loyiha yaratildi!", description: `${count} ta fayl muvaffaqiyatli yaratildi` });
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === loadingMsg.id ? {
        ...m, content: `❌ **Xatolik**: ${err?.message || "Noma'lum xato"}`
      } : m));
      toast({ title: "Xatolik", description: err?.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, onCreateFile, toast, projectName, files]);

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8 px-3">
              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center mb-3 border border-border">
              <Rocket className="h-6 w-6 text-primary" />
            </div>
              <h4 className="font-semibold text-sm mb-1">BuildForge AI</h4>
              <p className="text-[11px] text-muted-foreground max-w-[240px]">Generate full projects and files from a single prompt.</p>
              <div className="grid gap-2 mt-4 w-full max-w-[260px]">
                {BUILDFORGE_STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => { setInput(starter); void generateProject(starter); }}
                    className="rounded-md border border-border bg-background px-3 py-2 text-left text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                <Avatar className="h-6 w-6 flex-shrink-0">
                  <AvatarFallback className={cn("text-[10px]", msg.role === "user" ? "bg-primary/20 text-primary" : "bg-accent/20 text-accent-foreground")}>
                    {msg.role === "user" ? "U" : <Rocket className="h-3 w-3" />}
                  </AvatarFallback>
                </Avatar>
                <div className={cn("flex-1 min-w-0 p-2.5 rounded-md text-xs", msg.role === "user" ? "bg-secondary" : "bg-muted border border-border")}>
                  {msg.role === "assistant" ? (
                    <MarkdownContent content={msg.content} language={language} onApplyCode={(c) => activeFile && onUpdateFileContent(activeFile.id, c)} />
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
            {isGenerating && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-2">
                <Avatar className="h-6 w-6"><AvatarFallback className="bg-accent/20"><Loader2 className="h-3 w-3 animate-spin" /></AvatarFallback></Avatar>
                <div className="p-2.5 rounded-md bg-muted border border-border">
                  <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin text-primary" /><span className="text-[11px] text-muted-foreground">Generating...</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
      <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) { generateProject(input); setInput(""); } }} className="p-2 border-t border-border">
        <div className="flex gap-1.5">
          <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Describe the project..." className="flex-1 h-8 text-xs bg-background" disabled={isGenerating} />
          <Button type="submit" size="sm" className="h-8 w-8 p-0" disabled={isGenerating || !input.trim()}>
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </form>
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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);

    const userMsg: Message = { id: generateId(), role: "user", content: prompt, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    const fileList = files.map(f => `${f.is_folder ? "📁" : "📄"} ${f.path}${f.name}`).join("\n");
    const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ prompt: `${prompt}\n\nCurrent code:\n\`\`\`${language}\n${code}\n\`\`\``, code, language, messages: chatHistory }),
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

        const { text, actions } = parseAIResponse(assistantContent, language);
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: text, actions: actions.length > 0 ? actions : undefined } : m));
      } else {
        const data = await response.json();
        const responseText = data.response || data.error || "Javob yo'q";
        const { text, actions } = parseAIResponse(responseText, language);
        setMessages(prev => [...prev, { id: generateId(), role: "assistant", content: text, timestamp: new Date(), actions: actions.length > 0 ? actions : undefined }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: generateId(), role: "assistant", content: `❌ **Xatolik**: ${err?.message}`, timestamp: new Date() }]);
      toast({ title: "Xatolik", description: err?.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, code, language, files, toast]);

  const handleAction = useCallback(async (action: AIAction) => {
    if (action.type === "create_file" && action.name && action.path) {
      await onCreateFile(action.name, action.path, false, action.language, action.content || "");
      toast({ title: "Fayl yaratildi", description: action.name });
    } else if (action.type === "create_folder" && action.name && action.path) {
      await onCreateFile(action.name, action.path, true);
      toast({ title: "Papka yaratildi", description: action.name });
    } else if (action.type === "apply_code" && action.content && activeFile) {
      onUpdateFileContent(activeFile.id, action.content);
      toast({ title: "Kod qo'llanildi", description: activeFile.name });
    }
  }, [onCreateFile, onUpdateFileContent, activeFile, toast]);

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-3 border border-primary/20">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h4 className="font-semibold text-sm mb-1">CodeForge AI</h4>
            <p className="text-[11px] text-muted-foreground max-w-[220px]">
              Kod yozing, xatolarni toping, optimizatsiya qiling. Savolingizni yozing.
            </p>
            <div className="grid grid-cols-2 gap-1.5 mt-4 w-full max-w-[240px]">
              {[
                { icon: Code, label: "Explain code", prompt: "Explain this code in detail" },
                { icon: Bug, label: "Find bugs", prompt: "Find bugs in this code" },
                { icon: Wand2, label: "Refactor", prompt: "Refactor this code" },
                { icon: Sparkles, label: "Optimize", prompt: "Optimize this code" },
              ].map((item, i) => (
                <button key={i} onClick={() => sendMessage(item.prompt)}
                  className="flex items-center gap-1.5 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 border border-border/30 text-[10px] transition-colors">
                  <item.icon className="h-3 w-3 text-muted-foreground" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className="space-y-1">
                <div className={cn("flex gap-2", msg.role === "user" && "flex-row-reverse")}>
                  <Avatar className="h-6 w-6 flex-shrink-0">
                    <AvatarFallback className={cn("text-[10px]", msg.role === "user" ? "bg-primary/20 text-primary" : "bg-accent/20 text-accent-foreground")}>
                      {msg.role === "user" ? "U" : <Bot className="h-3 w-3" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn("flex-1 p-2.5 rounded-xl text-xs min-w-0", msg.role === "user" ? "bg-primary/15 rounded-tr-sm" : "bg-muted/30 border border-border/30 rounded-tl-sm")}>
                    {msg.role === "assistant" ? (
                      <MarkdownContent content={msg.content} language={language} onApplyCode={(c) => activeFile && onUpdateFileContent(activeFile.id, c)} />
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </div>
                {msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1 ml-8">
                    {msg.actions.map((action, i) => (
                      <button key={i} onClick={() => handleAction(action)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 border border-primary/20 text-[9px] font-medium">
                        {action.type === "create_file" && <><FilePlus className="h-2.5 w-2.5" /> {action.name}</>}
                        {action.type === "apply_code" && <><FileCode className="h-2.5 w-2.5" /> Apply</>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-2">
                <Avatar className="h-6 w-6"><AvatarFallback className="bg-accent/20"><Loader2 className="h-3 w-3 animate-spin" /></AvatarFallback></Avatar>
                <div className="p-2.5 rounded-xl bg-muted/30 border border-border/30 rounded-tl-sm">
                  <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin text-primary" /><span className="text-[11px] text-muted-foreground">Thinking...</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
      <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) { sendMessage(input); setInput(""); } }} className="p-2 border-t border-border/50">
        <div className="flex gap-1.5">
          <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Savolingizni yozing..." className="flex-1 h-8 text-xs bg-background/50" disabled={isLoading} />
          <Button type="submit" size="sm" className="h-8 w-8 p-0" disabled={isLoading || !input.trim()}>
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </form>
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
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageCircle className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map(msg => {
              const isOwn = msg.user_id === user?.id;
              return (
                <div key={msg.id} className={cn("flex gap-1.5", isOwn && "flex-row-reverse")}>
                  <Avatar className="h-6 w-6 flex-shrink-0">
                    <AvatarImage src={msg.profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{getInitials(msg.profile?.display_name)}</AvatarFallback>
                  </Avatar>
                  <div className={cn("max-w-[80%] rounded-lg px-2.5 py-1.5", isOwn ? "bg-primary text-primary-foreground" : "bg-muted/40")}>
                    {!isOwn && <p className="text-[9px] font-medium mb-0.5 opacity-60">{msg.profile?.display_name || "Anonymous"}</p>}
                    <p className="text-xs break-words">{msg.content}</p>
                    <p className={cn("text-[8px] mt-0.5", isOwn ? "opacity-50" : "text-muted-foreground")}>{formatTime(msg.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
      {isAuthenticated ? (
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-2 border-t border-border/50">
          <div className="flex gap-1.5">
            <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder={mutedByAdmin ? "Muted" : "Type a message..."} className="flex-1 h-8 text-xs bg-background/50" disabled={sending || mutedByAdmin} />
            <Button type="submit" size="sm" className="h-8 w-8 p-0" disabled={!newMessage.trim() || sending || mutedByAdmin}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </form>
      ) : (
        <div className="p-2 border-t border-border/50 text-center">
          <p className="text-xs text-muted-foreground">Sign in to chat</p>
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
  onCreateFile, onUpdateFileContent, projectName,
}: WorkspacePanelProps) => {
  const [activeTab, setActiveTab] = useState<TabId>("buildforge");

  if (!isOpen) return null;

  return (
    <div className="w-full h-full flex flex-col bg-card/95 backdrop-blur-sm border-l border-border overflow-hidden">
      {/* Tab bar */}
      <div className="flex h-9 border-b border-border flex-shrink-0 bg-muted/20">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors border-b-2",
              activeTab === tab.id
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "buildforge" && (
          <BuildForgePanel code={code} language={language} files={files} activeFile={activeFile}
            onCreateFile={onCreateFile} onUpdateFileContent={onUpdateFileContent} projectName={projectName} />
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
