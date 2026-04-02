import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Bot, Send, X, Sparkles, Loader2, Code, Lightbulb, Bug, Zap,
  FileCode, FolderPlus, FilePlus, Wand2, Copy, Check, RefreshCw,
  Maximize2, Minimize2, Rocket,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: AIAction[];
}

interface AIAction {
  type: "create_file" | "create_folder" | "apply_code";
  name?: string;
  path?: string;
  language?: string;
  content?: string;
  description?: string;
}

interface FileItem {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  is_folder: boolean;
}

interface AIAssistantProps {
  code: string;
  language: string;
  files: FileItem[];
  activeFile: FileItem | null;
  onCreateFile: (name: string, path: string, isFolder: boolean, language?: string, content?: string) => Promise<any>;
  onUpdateFileContent: (fileId: string, content: string) => void;
  author?: string;
}

const quickPrompts = [
  { icon: Code, label: "Explain code", prompt: "Explain this code in detail" },
  { icon: Bug, label: "Find bugs", prompt: "Check this code for bugs and fix them" },
  { icon: Lightbulb, label: "Optimize", prompt: "How can this code be improved?" },
  { icon: Zap, label: "New feature", prompt: "Add a new feature to this code" },
  { icon: FilePlus, label: "Create file", prompt: "Create a new file for me" },
  { icon: Wand2, label: "Refactor", prompt: "Refactor this code for better readability" },
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const parseAIResponse = (content: string, language: string): { text: string; actions: AIAction[] } => {
  const actions: AIAction[] = [];
  let text = content;

  const createFileRegex = /\[CREATE_FILE:\s*([^\],]+),\s*([^\],]+),\s*([^\]]+)\]/g;
  let match;
  while ((match = createFileRegex.exec(content)) !== null) {
    actions.push({ type: "create_file", name: match[1].trim(), path: match[2].trim(), language: match[3].trim() });
  }
  text = text.replace(createFileRegex, "");

  const createFolderRegex = /\[CREATE_FOLDER:\s*([^\],]+),\s*([^\]]+)\]/g;
  while ((match = createFolderRegex.exec(content)) !== null) {
    actions.push({ type: "create_folder", name: match[1].trim(), path: match[2].trim() });
  }
  text = text.replace(createFolderRegex, "");

  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    actions.push({ type: "apply_code", content: match[2].trim(), language: match[1] || language, description: `Code block` });
  }

  return { text: text.trim(), actions };
};

const AIAssistant = ({
  code, language, files, activeFile, onCreateFile, onUpdateFileContent, author = "Shokh-Developer",
}: AIAssistantProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [aiDisabled, setAiDisabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("user_ai_access").select("ai_enabled").eq("user_id", user.id).single();
        if (data) setAiDisabled(!data.ai_enabled);
      }
    };
    checkAccess();
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Streaming chat
  const sendMessage = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isLoading) return;
    if (aiDisabled) {
      toast({ title: "AI disabled", description: "Your AI access has been disabled by an admin", variant: "destructive" });
      return;
    }

    const userMessage: Message = { role: "user", content: prompt, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const fileList = files.map(f => `${f.is_folder ? "📁" : "📄"} ${f.path}${f.name}`).join("\n");
    const chatHistory = [...messages, userMessage].map(m => ({ role: m.role, content: m.content }));

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          prompt: `${prompt}\n\nProject files:\n${fileList}\n\nCurrent code (${activeFile?.name || "none"}):\n\`\`\`${language}\n${code}\n\`\`\``,
          code, language,
          messages: chatHistory,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      const contentType = resp.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && resp.body) {
        // Streaming response
        let assistantContent = "";
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Add empty assistant message
        setMessages(prev => [...prev, { role: "assistant", content: "", timestamp: new Date() }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIdx: number;
          while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                assistantContent += delta;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...updated[updated.length - 1], content: assistantContent };
                  return updated;
                });
              }
            } catch { /* partial JSON, skip */ }
          }
        }

        // Parse actions from final content
        const { text, actions } = parseAIResponse(assistantContent, language);
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: text,
            actions: actions.length > 0 ? actions : undefined,
          };
          return updated;
        });
      } else {
        // Non-streaming JSON response
        const data = await resp.json();
        const responseText = data.response || data.error || "No response";
        const { text, actions } = parseAIResponse(responseText, language);
        setMessages(prev => [...prev, {
          role: "assistant", content: text, timestamp: new Date(),
          actions: actions.length > 0 ? actions : undefined,
        }]);
      }
    } catch (error: any) {
      const msg = error?.message || "Something went wrong";
      setMessages(prev => [...prev, { role: "assistant", content: `❌ ${msg}`, timestamp: new Date() }]);
      toast({ title: "AI Error", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, aiDisabled, messages, files, activeFile, code, language, toast]);

  // Generate full project
  const generateProject = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setMessages(prev => [
      ...prev,
      { role: "user", content: `🚀 Generate project: ${prompt}`, timestamp: new Date() },
      { role: "assistant", content: "⏳ Generating project files...", timestamp: new Date() },
    ]);

    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { prompt, code: "", language: "html", mode: "generate-project" },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const responseText = data?.response || "[]";
      // Extract JSON from response (might be wrapped in ```json)
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      // Also try without code blocks
      if (!jsonStr.trim().startsWith("[")) {
        const arrayMatch = responseText.match(/\[[\s\S]*\]/);
        if (arrayMatch) jsonStr = arrayMatch[0];
      }

      const generatedFiles = JSON.parse(jsonStr.trim());
      let createdCount = 0;

      for (const file of generatedFiles) {
        if (file.name && file.content) {
          await onCreateFile(file.name, file.path || "/", false, file.language || "html", file.content);
          createdCount++;
        }
      }

      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `✅ Project generated! Created ${createdCount} files:\n\n${generatedFiles.map((f: any) => `- 📄 ${f.path || "/"}${f.name}`).join("\n")}\n\nYou can now edit any file in the explorer.`,
        };
        return updated;
      });

      toast({ title: "Project generated!", description: `${createdCount} files created` });
    } catch (error: any) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `❌ Failed to generate project: ${error?.message || "Unknown error"}`,
        };
        return updated;
      });
      toast({ title: "Generation failed", description: error?.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, onCreateFile, toast]);

  const handleAction = async (action: AIAction) => {
    try {
      if (action.type === "create_file" && action.name && action.path) {
        await onCreateFile(action.name, action.path, false, action.language, "");
        toast({ title: "File created!", description: `${action.name}` });
      } else if (action.type === "create_folder" && action.name && action.path) {
        await onCreateFile(action.name, action.path, true);
        toast({ title: "Folder created!", description: `${action.name}` });
      } else if (action.type === "apply_code" && action.content && activeFile) {
        onUpdateFileContent(activeFile.id, action.content);
        toast({ title: "Code applied!" });
      } else if (action.type === "apply_code" && !activeFile) {
        toast({ title: "Error", description: "Select a file first", variant: "destructive" });
      }
    } catch { toast({ title: "Error", description: "Action failed", variant: "destructive" }); }
  };

  const copyCode = (codeStr: string, index: number) => {
    navigator.clipboard.writeText(codeStr);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    // Check if it's a project generation request
    const lower = input.toLowerCase();
    if (lower.startsWith("/generate ") || lower.startsWith("/create project ") || lower.startsWith("/build ")) {
      generateProject(input.replace(/^\/(generate|create project|build)\s+/i, ""));
    } else {
      sendMessage(input);
    }
  };

  if (aiDisabled) return null;

  return (
    <>
      {/* Toggle Button */}
      <motion.div className="fixed bottom-4 right-[132px] z-50" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "h-12 w-12 rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center backdrop-blur-sm",
            isOpen ? "bg-primary/20 text-primary border border-primary/50 glow-sm" : "bg-card/90 text-primary border border-border hover:border-primary/50 hover:bg-card hover:glow-sm"
          )}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
                <X className="h-5 w-5" />
              </motion.div>
            ) : (
              <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
                <Sparkles className="h-5 w-5" />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </motion.div>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
              "fixed z-50 bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl shadow-primary/10 overflow-hidden flex flex-col",
              isExpanded
                ? "bottom-4 right-4 left-4 top-4 md:bottom-6 md:right-6 md:left-auto md:top-6 md:w-[750px]"
                : "bottom-20 right-4 w-[95vw] md:w-[440px] lg:w-[500px] h-[75vh] md:h-[640px]"
            )}
          >
            {/* Header */}
            <div className="p-3 px-4 bg-gradient-to-r from-primary/15 to-transparent border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      CodeForge AI
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        STREAMING
                      </span>
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      /generate to create full projects
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                    {isExpanded ? <Minimize2 className="h-3.5 w-3.5 text-muted-foreground" /> : <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  <button onClick={() => setMessages([])} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-3" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto mb-3 border border-primary/20">
                      <Wand2 className="h-8 w-8 text-primary" />
                    </div>
                    <h4 className="font-semibold text-sm mb-1">CodeForge AI Assistant</h4>
                    <p className="text-xs text-muted-foreground mb-1">Write code, fix bugs, generate projects</p>
                    <p className="text-[10px] text-primary/70 font-medium">Type /generate to create a full project from prompt</p>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {quickPrompts.map((item, index) => (
                      <motion.button
                        key={index}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04 }}
                        onClick={() => sendMessage(item.prompt)}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-background/50 hover:bg-background/80 border border-border/50 hover:border-primary/30 transition-all text-left group"
                      >
                        <item.icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                        <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">{item.label}</span>
                      </motion.button>
                    ))}
                  </div>

                  {/* Generate Project Button */}
                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    onClick={() => setInput("/generate ")}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 hover:from-primary/20 hover:to-accent/20 border border-primary/20 hover:border-primary/40 transition-all"
                  >
                    <Rocket className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-primary">Generate Full Project</span>
                  </motion.button>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn("flex gap-2", msg.role === "user" && "flex-row-reverse")}
                    >
                      <Avatar className="h-7 w-7 flex-shrink-0">
                        <AvatarFallback className={msg.role === "user" ? "bg-primary/20 text-primary text-xs" : "bg-accent/20 text-accent"}>
                          {msg.role === "user" ? "U" : <Bot className="h-3.5 w-3.5" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-1.5 min-w-0">
                        <div className={cn(
                          "p-2.5 rounded-xl text-[13px] leading-relaxed",
                          msg.role === "user" ? "bg-primary/15 text-foreground" : "bg-background/60 border border-border/50"
                        )}>
                          {msg.role === "assistant" ? (
                            <div className="prose prose-sm prose-invert max-w-none [&_pre]:my-2 [&_p]:my-1">
                              <ReactMarkdown
                                components={{
                                  code({ className, children, ...props }) {
                                    const isBlock = className?.includes("language-");
                                    if (isBlock) {
                                      const codeStr = String(children).replace(/\n$/, "");
                                      return (
                                        <div className="relative group my-2">
                                          <pre className="bg-background/80 p-2.5 rounded-lg overflow-x-auto text-[11px] border border-border/30">
                                            <code {...props}>{children}</code>
                                          </pre>
                                          <button onClick={() => copyCode(codeStr, index)} className="absolute top-1.5 right-1.5 p-1 rounded bg-muted/80 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {copiedIndex === index ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                          </button>
                                        </div>
                                      );
                                    }
                                    return <code className="bg-background/80 px-1 py-0.5 rounded text-[11px] font-mono" {...props}>{children}</code>;
                                  },
                                  pre: ({ children }) => <>{children}</>,
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <span className="text-[13px]">{msg.content}</span>
                          )}
                        </div>

                        {/* Actions */}
                        {msg.actions && msg.actions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.actions.map((action, ai) => (
                              <button
                                key={ai}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-[11px] font-medium transition-colors"
                                onClick={() => handleAction(action)}
                              >
                                {action.type === "create_file" && <><FilePlus className="h-3 w-3 text-primary" /> {action.name}</>}
                                {action.type === "create_folder" && <><FolderPlus className="h-3 w-3 text-primary" /> {action.name}</>}
                                {action.type === "apply_code" && <><FileCode className="h-3 w-3 text-accent" /> Apply code</>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}

                  {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="bg-accent/20 text-accent"><Loader2 className="h-3.5 w-3.5 animate-spin" /></AvatarFallback>
                      </Avatar>
                      <div className="p-2.5 rounded-xl bg-background/60 border border-border/50 text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-3 border-t border-border flex-shrink-0">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isGenerating ? "Generating project..." : "Ask anything or /generate project..."}
                  className="flex-1 h-10 text-sm bg-background/50 border-border/50 focus:border-primary/50"
                  disabled={isLoading || isGenerating}
                />
                <button
                  type="submit"
                  disabled={isLoading || isGenerating || !input.trim()}
                  className="h-10 w-10 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/30 flex items-center justify-center transition-colors disabled:opacity-40"
                >
                  {isLoading || isGenerating ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Send className="h-4 w-4 text-primary" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                💡 /generate e-commerce site · /build portfolio · or just ask anything
              </p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIAssistant;
