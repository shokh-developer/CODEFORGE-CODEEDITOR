import { useState, useRef, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { normalizeGeneratedProjectFiles } from "@/lib/ai-json";
import {
  Bot, Send, X, Sparkles, Loader2, Code, Lightbulb, Bug, Zap,
  FileCode, FolderPlus, FilePlus, Wand2, Copy, Check, RefreshCw,
  Rocket, Trash2, Maximize2, Minimize2, Settings, History, 
  MessageSquare, ThumbsUp, ThumbsDown, Bookmark, Plus, 
  ChevronDown, ChevronUp, Terminal, Database, Server, Globe,
  Cpu, Shield, Users, GitBranch, Play, Save, Download, Share2
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";

// ==================== TYPES & INTERFACES ====================

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  actions?: AIAction[];
  feedback?: "like" | "dislike";
  bookmarked?: boolean;
  tokens?: number;
  model?: string;
}

interface AIAction {
  type: "create_file" | "create_folder" | "apply_code" | "refactor" | "debug" | "optimize" | "test";
  name?: string;
  path?: string;
  language?: string;
  content?: string;
  description?: string;
  beforeCode?: string;
  afterCode?: string;
  suggestions?: string[];
}

interface FileItem {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  is_folder: boolean;
  size?: number;
  lastModified?: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  projectId?: string;
}

interface AIAssistantProps {
  code: string;
  language: string;
  files: FileItem[];
  activeFile: FileItem | null;
  onCreateFile: (name: string, path: string, isFolder: boolean, language?: string, content?: string) => Promise<any>;
  onUpdateFileContent: (fileId: string, content: string) => void;
  onDeleteFile?: (fileId: string) => void;
  onRefactor?: (fileId: string, newCode: string) => void;
  author?: string;
  projectId?: string;
  projectName?: string;
}

interface AIModel {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google" | "local";
  maxTokens: number;
  temperature: number;
}

// ==================== CONSTANTS ====================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const AVAILABLE_MODELS: AIModel[] = [
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "openai", maxTokens: 128000, temperature: 0.7 },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "openai", maxTokens: 16384, temperature: 0.7 },
  { id: "claude-3-opus", name: "Claude 3 Opus", provider: "anthropic", maxTokens: 200000, temperature: 0.7 },
  { id: "claude-3-sonnet", name: "Claude 3 Sonnet", provider: "anthropic", maxTokens: 200000, temperature: 0.7 },
  { id: "gemini-pro", name: "Gemini Pro", provider: "google", maxTokens: 32768, temperature: 0.7 },
];

const QUICK_PROMPTS = [
  { icon: Code, label: "Explain code", prompt: "Explain this code in detail, including its purpose, structure, and potential improvements.", color: "from-blue-500/20 to-cyan-500/20" },
  { icon: Bug, label: "Find bugs", prompt: "Analyze this code for bugs, security vulnerabilities, and logic errors. Provide fixes for each issue found.", color: "from-red-500/20 to-orange-500/20" },
  { icon: Lightbulb, label: "Optimize", prompt: "Optimize this code for better performance, readability, and maintainability. Show before/after comparisons.", color: "from-yellow-500/20 to-amber-500/20" },
  { icon: Zap, label: "New feature", prompt: "Add a new feature to this code. Describe the implementation approach and provide the complete code.", color: "from-purple-500/20 to-pink-500/20" },
  { icon: FilePlus, label: "Create file", prompt: "Create a new file for this project. Specify the file name, path, and complete content.", color: "from-green-500/20 to-emerald-500/20" },
  { icon: Wand2, label: "Refactor", prompt: "Refactor this code following best practices and design patterns. Explain the changes made.", color: "from-indigo-500/20 to-violet-500/20" },
  { icon: Shield, label: "Security", prompt: "Analyze this code for security vulnerabilities and provide fixes for each issue.", color: "from-red-500/20 to-rose-500/20" },
  { icon: GitBranch, label: "Best practices", prompt: "Review this code against industry best practices and suggest improvements.", color: "from-teal-500/20 to-cyan-500/20" },
];

// ==================== UTILITY FUNCTIONS ====================

const parseAIResponse = (content: string, language: string): { text: string; actions: AIAction[] } => {
  const actions: AIAction[] = [];
  let text = content;

  // Parse file creation commands
  const createFileRegex = /\[CREATE_FILE:\s*([^\],]+),\s*([^\],]+),\s*([^\]]+)\]/gi;
  let match;
  while ((match = createFileRegex.exec(content)) !== null) {
    actions.push({ 
      type: "create_file", 
      name: match[1].trim(), 
      path: match[2].trim(), 
      language: match[3].trim() 
    });
  }
  text = text.replace(createFileRegex, "");

  // Parse folder creation
  const createFolderRegex = /\[CREATE_FOLDER:\s*([^\],]+),\s*([^\]]+)\]/gi;
  while ((match = createFolderRegex.exec(content)) !== null) {
    actions.push({ 
      type: "create_folder", 
      name: match[1].trim(), 
      path: match[2].trim() 
    });
  }
  text = text.replace(createFolderRegex, "");

  // Parse refactoring commands
  const refactorRegex = /\[REFACTOR:\s*([^\]]+)\]/gi;
  while ((match = refactorRegex.exec(content)) !== null) {
    actions.push({ 
      type: "refactor", 
      description: match[1].trim(),
      suggestions: match[1].split(",").map(s => s.trim())
    });
  }
  text = text.replace(refactorRegex, "");

  // Parse debug commands
  const debugRegex = /\[DEBUG:\s*([^\]]+)\]/gi;
  while ((match = debugRegex.exec(content)) !== null) {
    actions.push({ 
      type: "debug", 
      description: match[1].trim() 
    });
  }
  text = text.replace(debugRegex, "");

  // Extract code blocks
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    actions.push({ 
      type: "apply_code", 
      content: match[2].trim(), 
      language: match[1] || language, 
      description: `Code block in ${match[1] || language}` 
    });
  }

  return { text: text.trim(), actions };
};

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const formatDate = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

// ==================== CUSTOM HOOKS ====================

const useLocalStorage = <T,>(key: string, initialValue: T): [T, (value: T) => void] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }
  };

  return [storedValue, setStoredValue];
};

const useConversations = (projectId?: string) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const loadConversations = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: convs } = await supabase
      .from("ai_conversations" as any)
      .select("id, title, project_id, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (!convs) return;
    setConversations(
      (convs as any[]).map(c => ({
        id: c.id,
        title: c.title,
        messages: [],
        projectId: c.project_id || undefined,
        createdAt: new Date(c.created_at),
        updatedAt: new Date(c.updated_at),
      }))
    );
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const createConversation = useCallback(async (title: string): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("ai_conversations" as any)
      .insert({ user_id: user.id, title: title.slice(0, 80), project_id: projectId } as any)
      .select("id")
      .single();
    if (error || !data) return null;
    await loadConversations();
    return (data as any).id;
  }, [projectId, loadConversations]);

  const persistMessage = useCallback(async (conversationId: string, role: string, content: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("ai_messages" as any).insert({
      conversation_id: conversationId,
      user_id: user.id,
      role,
      content,
    } as any);
    await supabase
      .from("ai_conversations" as any)
      .update({ updated_at: new Date().toISOString() } as any)
      .eq("id", conversationId);
  }, []);

  const loadMessages = useCallback(async (conversationId: string): Promise<Message[]> => {
    const { data } = await supabase
      .from("ai_messages" as any)
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (!data) return [];
    return (data as any[]).map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.created_at),
    }));
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    await supabase.from("ai_conversations" as any).delete().eq("id", id);
    await loadConversations();
  }, [loadConversations]);

  const getProjectConversations = useCallback(() => {
    return conversations.filter(c => !projectId || c.projectId === projectId);
  }, [conversations, projectId]);

  return { conversations, createConversation, persistMessage, loadMessages, deleteConversation, getProjectConversations, reload: loadConversations };
};

// ==================== COMPONENTS ====================

const MessageCodeBlock = memo(({ code, language, onCopy, onApply }: { 
  code: string; 
  language: string; 
  onCopy: () => void; 
  onApply: () => void;
  copied?: boolean;
}) => {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-border/50">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Code className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-mono text-muted-foreground">{language || "code"}</span>
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleCopy} className="p-1 rounded hover:bg-background/80 transition-colors">
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>Copy code</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {onApply && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={onApply} className="p-1 rounded hover:bg-background/80 transition-colors">
                    <FileCode className="h-3 w-3 text-primary" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Apply to file</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      <SyntaxHighlighter
        language={language.toLowerCase()}
        style={theme === "dark" ? vscDarkPlus : vs}
        customStyle={{ margin: 0, fontSize: "11px", padding: "12px" }}
        showLineNumbers
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
});

MessageCodeBlock.displayName = "MessageCodeBlock";

const MessageContent = memo(({ content, language, onApplyCode }: { 
  content: string; 
  language: string; 
  onApplyCode: (code: string) => void;
}) => {
  return (
    <div className="prose prose-sm prose-invert max-w-none [&_pre]:my-2 [&_p]:my-1 text-[12px] leading-relaxed break-words [overflow-wrap:anywhere] [word-break:break-word]">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isBlock = !!match;
            const codeStr = String(children).replace(/\n$/, "");
            
            if (isBlock) {
              return (
                <MessageCodeBlock
                  code={codeStr}
                  language={match?.[1] || language}
                  onCopy={() => {}}
                  onApply={() => onApplyCode(codeStr)}
                />
              );
            }
            
            return (
              <code className="bg-background/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-primary" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1.5">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold mt-2.5 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xs font-semibold mt-2 mb-0.5">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1.5">{children}</ol>,
          li: ({ children }) => <li className="text-[11px]">{children}</li>,
          p: ({ children }) => <p className="my-1.5">{children}</p>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/50 pl-3 my-1.5 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse text-[11px]">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-border/50 px-2 py-1 bg-muted/30 text-left">{children}</th>,
          td: ({ children }) => <td className="border border-border/50 px-2 py-1">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

MessageContent.displayName = "MessageContent";

const QuickPromptButton = memo(({ icon: Icon, label, prompt, color, onClick }: { 
  icon: any; 
  label: string; 
  prompt: string; 
  color: string;
  onClick: (prompt: string) => void;
}) => {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(prompt)}
      className={cn(
        "flex items-center gap-2 p-2.5 rounded-xl bg-gradient-to-r transition-all duration-200 text-left group",
        color,
        "hover:shadow-lg hover:shadow-primary/10 border border-border/50 hover:border-primary/30"
      )}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-medium text-foreground/80 group-hover:text-foreground transition-colors">
          {label}
        </span>
      </div>
      <ChevronUp className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
    </motion.button>
  );
});

QuickPromptButton.displayName = "QuickPromptButton";

const ConversationItem = memo(({ conversation, isActive, onClick, onDelete }: {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        "group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all duration-200",
        isActive ? "bg-primary/20 border border-primary/30" : "hover:bg-muted/50 border border-transparent"
      )}
      onClick={onClick}
    >
      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium truncate">{conversation.title}</p>
        <p className="text-[9px] text-muted-foreground">{formatDate(conversation.updatedAt)}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 transition-all"
      >
        <Trash2 className="h-3 w-3 text-destructive" />
      </button>
    </motion.div>
  );
});

ConversationItem.displayName = "ConversationItem";

// ==================== MAIN COMPONENT ====================

const AIAssistant = ({
  code,
  language,
  files,
  activeFile,
  onCreateFile,
  onUpdateFileContent,
  onDeleteFile,
  onRefactor,
  author,
  projectId,
  projectName,
}: AIAssistantProps) => {
  // State
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [aiDisabled, setAiDisabled] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AIModel>(AVAILABLE_MODELS[0]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  
  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Hooks
  const { toast } = useToast();
  const { theme } = useTheme();
  const { saveConversation, deleteConversation, getProjectConversations } = useConversations(projectId);

  // Effects
  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("user_ai_access")
          .select("ai_enabled")
          .eq("user_id", user.id)
          .single();
        if (data) setAiDisabled(!data.ai_enabled);
      }
    };
    checkAccess();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Save conversation on message change
  useEffect(() => {
    if (messages.length > 0 && currentConversationId) {
      const firstUserMessage = messages.find(m => m.role === "user");
      const title = firstUserMessage?.content.slice(0, 50) || "New Conversation";
      
      saveConversation({
        id: currentConversationId,
        title,
        messages,
        createdAt: new Date(),
        updatedAt: new Date(),
        projectId,
      });
    }
  }, [messages, currentConversationId, projectId, saveConversation]);

  // Core Functions
  const sendMessage = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isLoading) return;
    if (aiDisabled) {
      toast({ title: "AI Disabled", description: "Your AI access has been disabled by an administrator", variant: "destructive" });
      return;
    }

    // Create new conversation if needed
    if (!currentConversationId) {
      setCurrentConversationId(generateId());
    }

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: prompt,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Prepare context
    const fileList = files.map(f => `${f.is_folder ? "📁" : "📄"} ${f.path}${f.name}`).join("\n");
    const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));
    
    const systemPrompt = `You are CodeForge AI, an expert software engineer assistant. 
Project: ${projectName || "Untitled Project"}
Files: ${fileList}
Active File: ${activeFile?.name || "none"}
Language: ${language}

Guidelines:
- Provide complete, working code solutions
- Include explanations for complex logic
- Suggest best practices and optimizations
- Format code blocks with language specification
- Use [CREATE_FILE: name, path, language] for new files
- Use [CREATE_FOLDER: name, path] for folders
- Use [REFACTOR: suggestions] for refactoring
- Be concise but thorough
- Ask clarifying questions when needed`;

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          prompt: `${prompt}\n\nCurrent code:\n\`\`\`${language}\n${code}\n\`\`\``,
          code,
          language,
          messages: chatHistory,
          systemPrompt,
          model: selectedModel.id,
          temperature,
          maxTokens,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && response.body) {
        let assistantContent = "";
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        
        const assistantMessageId = generateId();
        setMessages(prev => [...prev, {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
        }]);

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
                setMessages(prev => {
                  const updated = [...prev];
                  const index = updated.findIndex(m => m.id === assistantMessageId);
                  if (index !== -1) {
                    updated[index] = { ...updated[index], content: assistantContent };
                  }
                  return updated;
                });
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }

        const { text, actions } = parseAIResponse(assistantContent, language);
        setMessages(prev => {
          const updated = [...prev];
          const index = updated.findIndex(m => m.id === assistantMessageId);
          if (index !== -1) {
            updated[index] = {
              ...updated[index],
              content: text,
              actions: actions.length > 0 ? actions : undefined,
            };
          }
          return updated;
        });
      } else {
        const data = await response.json();
        const responseText = data.response || data.error || "No response from AI";
        const { text, actions } = parseAIResponse(responseText, language);
        
        setMessages(prev => [...prev, {
          id: generateId(),
          role: "assistant",
          content: text,
          timestamp: new Date(),
          actions: actions.length > 0 ? actions : undefined,
        }]);
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, {
        id: generateId(),
        role: "assistant",
        content: `❌ **Error**: ${error?.message || "Something went wrong. Please try again."}\n\nPlease check your connection and try again.`,
        timestamp: new Date(),
      }]);
      toast({ title: "AI Error", description: error?.message || "Failed to get response", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, aiDisabled, messages, files, activeFile, code, language, toast, selectedModel, temperature, maxTokens, projectName, currentConversationId]);

  const generateProject = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    
    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: `🚀 **Generate Project**: ${prompt}`,
      timestamp: new Date(),
    };
    
    const loadingMessage: Message = {
      id: generateId(),
      role: "assistant",
      content: "⏳ **Generating your project...**\n\nThis may take a moment. I'm creating files and setting up the structure.",
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage, loadingMessage]);

    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { 
          prompt, 
          code: "", 
          language: "tsx", 
          mode: "generate-project",
          projectName,
          files: files.map(f => ({ name: f.name, path: f.path, language: f.language })),
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const responseText = data?.response || "[]";
      const generatedFiles = normalizeGeneratedProjectFiles(responseText);
      let createdCount = 0;

      for (const file of generatedFiles) {
        if (!file.is_folder && file.name) {
          await onCreateFile(file.name, file.path || "/", false, file.language || "tsx", file.content);
          createdCount++;
        }
      }

      setMessages(prev => {
        const updated = [...prev];
        const loadingIndex = updated.findIndex(m => m.id === loadingMessage.id);
        if (loadingIndex !== -1) {
          updated[loadingIndex] = {
            ...updated[loadingIndex],
            content: `✅ **Project Generated Successfully!**\n\nCreated ${createdCount} files:\n\n${generatedFiles.map((f: any) => `- 📄 \`${f.path || "/"}${f.name}\``).join("\n")}\n\nYou can now edit any file and click the 👁 **Preview** button to see results.\n\n🎉 Ready to build!`,
          };
        }
        return updated;
      });

      toast({ title: "Project Generated!", description: `${createdCount} files created successfully` });
    } catch (error: any) {
      setMessages(prev => {
        const updated = [...prev];
        const loadingIndex = updated.findIndex(m => m.id === loadingMessage.id);
        if (loadingIndex !== -1) {
          updated[loadingIndex] = {
            ...updated[loadingIndex],
            content: `❌ **Generation Failed**\n\n${error?.message || "Unknown error occurred"}\n\nPlease check your prompt and try again.`,
          };
        }
        return updated;
      });
      toast({ title: "Generation Failed", description: error?.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, onCreateFile, toast, projectName, files]);

  const handleAction = useCallback(async (action: AIAction) => {
    try {
      switch (action.type) {
        case "create_file":
          if (action.name && action.path) {
            await onCreateFile(action.name, action.path, false, action.language, action.content || "");
            toast({ title: "File Created", description: `${action.name}`, variant: "default" });
          }
          break;
          
        case "create_folder":
          if (action.name && action.path) {
            await onCreateFile(action.name, action.path, true);
            toast({ title: "Folder Created", description: `${action.name}`, variant: "default" });
          }
          break;
          
        case "apply_code":
          if (action.content && activeFile) {
            onUpdateFileContent(activeFile.id, action.content);
            toast({ title: "Code Applied", description: `Updated ${activeFile.name}`, variant: "default" });
          } else if (!activeFile) {
            toast({ title: "No File Selected", description: "Select a file to apply code", variant: "destructive" });
          }
          break;
          
        case "refactor":
          if (action.suggestions && activeFile && onRefactor) {
            onRefactor(activeFile.id, action.content || "");
            toast({ title: "Refactoring Applied", description: "Code has been refactored", variant: "default" });
          }
          break;
          
        default:
          console.log("Unknown action type:", action.type);
      }
    } catch (error) {
      console.error("Action failed:", error);
      toast({ title: "Action Failed", description: "Could not complete the requested action", variant: "destructive" });
    }
  }, [onCreateFile, onUpdateFileContent, onRefactor, activeFile, toast]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const lowerInput = input.toLowerCase();
    if (lowerInput.startsWith("/generate ") || lowerInput.startsWith("/create ") || lowerInput.startsWith("/build ")) {
      generateProject(input.replace(/^\/(generate|create|build)\s+/i, ""));
    } else {
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
    toast({ title: "Chat Cleared", description: "Started a new conversation" });
  };

  const loadConversation = (conversation: Conversation) => {
    setMessages(conversation.messages);
    setCurrentConversationId(conversation.id);
    setShowHistory(false);
    toast({ title: "Conversation Loaded", description: conversation.title });
  };

  const startNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(generateId());
    setShowHistory(false);
    toast({ title: "New Conversation", description: "Started a fresh chat session" });
  };

  if (aiDisabled) return null;

  return (
    <TooltipProvider>
      {/* Toggle Button */}
      <motion.div
        className="fixed bottom-4 right-4 z-50"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "h-12 w-12 rounded-xl shadow-lg transition-all duration-300 flex items-center justify-center backdrop-blur-sm relative group",
            isOpen 
              ? "bg-primary/20 text-primary border border-primary/50 shadow-primary/20" 
              : "bg-card/90 text-primary border border-border hover:border-primary/50 hover:bg-card hover:shadow-lg hover:shadow-primary/20"
          )}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
              >
                <X className="h-5 w-5" />
              </motion.div>
            ) : (
              <motion.div
                key="open"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
              >
                <Sparkles className="h-5 w-5" />
              </motion.div>
            )}
          </AnimatePresence>
          {!isOpen && (
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
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
              "fixed z-50 bottom-[72px] right-4 bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl shadow-primary/20 overflow-hidden flex flex-col transition-all duration-300",
              isExpanded ? "w-[90vw] h-[85vh] max-w-[1200px]" : "w-[450px] h-[600px]"
            )}
          >
            {/* Header */}
            <div className="h-12 px-4 bg-gradient-to-r from-primary/10 to-transparent border-b border-border flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-xs flex items-center gap-2">
                    CodeForge AI
                    <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                      {selectedModel.name}
                    </Badge>
                  </h3>
                  <p className="text-[9px] text-muted-foreground">/generate to create projects • {messages.length} messages</p>
                </div>
              </div>
              
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={startNewConversation} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>New conversation</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => setShowHistory(!showHistory)} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <History className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>History</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Settings</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                      {isExpanded ? <Minimize2 className="h-3.5 w-3.5 text-muted-foreground" /> : <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{isExpanded ? "Minimize" : "Expand"}</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={clearChat} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Clear chat</TooltipContent>
                </Tooltip>
                
                <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Settings Panel */}
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-b border-border overflow-hidden"
                >
                  <div className="p-3 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-medium">AI Model</label>
                      <select
                        value={selectedModel.id}
                        onChange={(e) => setSelectedModel(AVAILABLE_MODELS.find(m => m.id === e.target.value) || AVAILABLE_MODELS[0])}
                        className="text-[10px] px-2 py-1 rounded bg-background border border-border"
                      >
                        {AVAILABLE_MODELS.map(model => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="text-[11px] font-medium block mb-1">Temperature: {temperature}</label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full h-1.5 rounded-lg appearance-none bg-primary/20 accent-primary"
                      />
                      <p className="text-[9px] text-muted-foreground mt-1">Higher = more creative, Lower = more focused</p>
                    </div>
                    
                    <div>
                      <label className="text-[11px] font-medium block mb-1">Max Tokens: {maxTokens}</label>
                      <input
                        type="range"
                        min="512"
                        max="8192"
                        step="512"
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-lg appearance-none bg-primary/20 accent-primary"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* History Panel */}
            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-b border-border overflow-hidden"
                >
                  <div className="p-3 max-h-[200px] overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-medium">Conversation History</span>
                      <span className="text-[9px] text-muted-foreground">{getProjectConversations().length} conversations</span>
                    </div>
                    <div className="space-y-1">
                      {getProjectConversations().map(conv => (
                        <ConversationItem
                          key={conv.id}
                          conversation={conv}
                          isActive={conv.id === currentConversationId}
                          onClick={() => loadConversation(conv)}
                          onDelete={() => deleteConversation(conv.id)}
                        />
                      ))}
                      {getProjectConversations().length === 0 && (
                        <p className="text-[10px] text-muted-foreground text-center py-4">No saved conversations</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="space-y-6 py-4">
                  <div className="text-center">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mx-auto mb-4 border border-primary/20">
                      <Wand2 className="h-8 w-8 text-primary" />
                    </div>
                    <h4 className="font-semibold text-base mb-1">CodeForge AI Assistant</h4>
                    <p className="text-[11px] text-muted-foreground max-w-[280px] mx-auto">
                      Your intelligent coding companion. Write code, fix bugs, generate full projects, and more.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center">
                      Quick Actions
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {QUICK_PROMPTS.map((item, index) => (
                        <QuickPromptButton
                          key={index}
                          icon={item.icon}
                          label={item.label}
                          prompt={item.prompt}
                          color={item.color}
                          onClick={sendMessage}
                        />
                      ))}
                    </div>
                  </div>

                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    onClick={() => setInput("/generate ")}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 hover:from-primary/20 hover:to-accent/20 border border-primary/20 hover:border-primary/40 transition-all group"
                  >
                    <Rocket className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                      Generate Full Project
                    </span>
                  </motion.button>
                </div>
              ) : (
                <LayoutGroup>
                  <div className="space-y-4">
                    {messages.map((msg, index) => (
                      <motion.div
                        key={msg.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className={cn(
                            "text-[11px]",
                            msg.role === "user" 
                              ? "bg-primary/20 text-primary" 
                              : "bg-gradient-to-br from-accent/30 to-primary/30 text-primary"
                          )}>
                            {msg.role === "user" ? "U" : <Bot className="h-3.5 w-3.5" />}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className={cn(
                            "p-3 rounded-2xl text-[12px] leading-relaxed",
                            msg.role === "user" 
                              ? "bg-primary/15 text-foreground rounded-tr-sm" 
                              : "bg-background/60 border border-border/50 rounded-tl-sm"
                          )}>
                            {msg.role === "assistant" ? (
                              <MessageContent 
                                content={msg.content} 
                                language={language}
                                onApplyCode={(code) => activeFile && onUpdateFileContent(activeFile.id, code)}
                              />
                            ) : (
                              <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</span>
                            )}
                          </div>

                          {msg.actions && msg.actions.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {msg.actions.map((action, ai) => (
                                <button
                                  key={ai}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-[10px] font-medium transition-all hover:scale-105"
                                  onClick={() => handleAction(action)}
                                >
                                  {action.type === "create_file" && <><FilePlus className="h-3 w-3" /> {action.name}</>}
                                  {action.type === "create_folder" && <><FolderPlus className="h-3 w-3" /> {action.name}</>}
                                  {action.type === "apply_code" && <><FileCode className="h-3 w-3" /> Apply Code</>}
                                  {action.type === "refactor" && <><Wand2 className="h-3 w-3" /> Refactor</>}
                                  {action.type === "debug" && <><Bug className="h-3 w-3" /> Debug</>}
                                </button>
                              ))}
                            </div>
                          )}
                          
                          <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                            <span>{formatDate(msg.timestamp)}</span>
                            {msg.tokens && <span>• {msg.tokens} tokens</span>}
                          </div>
                        </div>
                      </motion.div>
                    ))}

                    {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex gap-3"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-gradient-to-br from-accent/30 to-primary/30">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="p-3 rounded-2xl bg-background/60 border border-border/50 rounded-tl-sm">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            <span className="text-[11px] text-muted-foreground">AI is thinking...</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </LayoutGroup>
              )}
            </ScrollArea>

            {/* Input Area */}
            <form onSubmit={handleSubmit} className="p-3 border-t border-border flex-shrink-0">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isGenerating ? "Generating project..." : isLoading ? "Processing..." : "Ask me anything... or /generate <project idea>"}
                    className="w-full h-10 text-xs bg-background/50 border-border/50 focus:border-primary/50 pr-20"
                    disabled={isLoading || isGenerating}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[8px] font-mono bg-muted rounded border border-border">
                      ↵
                    </kbd>
                  </div>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isLoading || isGenerating || !input.trim()}
                  className="h-10 w-10 p-0"
                >
                  {isLoading || isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[8px] h-4 gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online
                  </Badge>
                  <span className="text-[8px] text-muted-foreground">
                    {files.length} files • {code.split("\n").length} lines
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="p-1 rounded hover:bg-muted/50 transition-colors">
                    <Download className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button type="button" className="p-1 rounded hover:bg-muted/50 transition-colors">
                    <Share2 className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipProvider>
  );
};

export default AIAssistant;
