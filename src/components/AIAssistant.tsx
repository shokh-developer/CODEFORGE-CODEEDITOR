import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Bot,
  Send,
  X,
  Sparkles,
  Loader2,
  Code,
  Lightbulb,
  Bug,
  Zap,
  FileCode,
  FolderPlus,
  FilePlus,
  Wand2,
  Copy,
  Check,
  RefreshCw,
  ArrowUp,
  Crown,
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
  type: "create_file" | "create_folder" | "edit_code" | "apply_code";
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
  { icon: Code, label: "Explain code", prompt: "Explain this code" },
  { icon: Bug, label: "Find bugs", prompt: "Check this code for bugs" },
  { icon: Lightbulb, label: "Optimize", prompt: "How can this code be improved?" },
  { icon: Zap, label: "New feature", prompt: "Add a new feature to this code" },
  { icon: FilePlus, label: "Create file", prompt: "Create a new file for me" },
  { icon: Wand2, label: "Refactor code", prompt: "Refactor this code" },
];

const normalizeAiErrorMessage = (raw: string): string => {
  const msg = (raw || "").trim();
  const lower = msg.toLowerCase();

  if (lower.includes("ai xizmati bepul rejimda") || lower.includes("tez orada yangi limitlar")) {
    return "AI quota is currently exhausted. Please try again later or configure your own AI API keys.";
  }
  if (lower.includes("juda ko'p so'rov")) {
    return "Too many requests. Please wait a bit and try again.";
  }
  if (
    lower.includes("resource_exhausted") ||
    lower.includes("\"code\": 429") ||
    lower.includes("code\":429") ||
    lower.includes("quota exceeded") ||
    lower.includes("exceeded your current quota") ||
    lower.includes("rate limit exceeded")
  ) {
    return "Your Google AI key quota is exhausted. Add billing or wait for quota reset, then try again.";
  }
  if (
    lower.includes("api key not valid") ||
    lower.includes("invalid api key") ||
    lower.includes("permission denied")
  ) {
    return "Google AI key is invalid or not allowed for this API. Check key permissions in Google AI Studio.";
  }
  if (
    lower.includes("openrouter") &&
    (lower.includes("insufficient credits") || lower.includes("payment required") || lower.includes("402"))
  ) {
    return "OpenRouter free credits are exhausted. Add another provider key or wait for reset.";
  }
  if (lower.includes("openrouter") && lower.includes("no endpoints found")) {
    return "Selected OpenRouter model is temporarily unavailable. Trying another free model.";
  }
  if (lower.includes("javob olishda xatolik")) {
    return "Failed to get a response from AI service.";
  }

  return msg;
};

const DIRECT_GOOGLE_MODEL_CANDIDATES = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];
const OPENROUTER_MODEL_CANDIDATES = [
  "deepseek/deepseek-r1-0528:free",
  "meta-llama/llama-3.3-8b-instruct:free",
  "google/gemma-2-9b-it:free",
];
const shouldUseDirectGoogleFallback = (message: string): boolean => {
  const lower = (message || "").toLowerCase();
  return (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("no ai keys") ||
    lower.includes("exhausted")
  );
};

const buildGoogleGenerateUrl = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const AIAssistant = ({
  code,
  language,
  files,
  activeFile,
  onCreateFile,
  onUpdateFileContent,
  author = "Shokh-Developer",
}: AIAssistantProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [aiDisabled, setAiDisabled] = useState(false);
  const directGoogleKey = (import.meta.env.VITE_GOOGLE_AI_KEY as string | undefined)?.trim();
  const openRouterKey = (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined)?.trim();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const checkSettings = async () => {
      // Check if current user has AI access
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: aiAccess } = await supabase
          .from("user_ai_access")
          .select("ai_enabled")
          .eq("user_id", user.id)
          .single();
        
        if (aiAccess) {
          setAiDisabled(!aiAccess.ai_enabled);
        }
      }
    };
    checkSettings();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const parseAIResponse = (content: string): { text: string; actions: AIAction[] } => {
    const actions: AIAction[] = [];
    let text = content;

    // Parse file creation commands: [CREATE_FILE: name.ext, path, language]
    const createFileRegex = /\[CREATE_FILE:\s*([^\],]+),\s*([^\],]+),\s*([^\]]+)\]/g;
    let match;
    while ((match = createFileRegex.exec(content)) !== null) {
      actions.push({
        type: "create_file",
        name: match[1].trim(),
        path: match[2].trim(),
        language: match[3].trim(),
      });
    }
    text = text.replace(createFileRegex, "");

    // Parse folder creation: [CREATE_FOLDER: name, path]
    const createFolderRegex = /\[CREATE_FOLDER:\s*([^\],]+),\s*([^\]]+)\]/g;
    while ((match = createFolderRegex.exec(content)) !== null) {
      actions.push({
        type: "create_folder",
        name: match[1].trim(),
        path: match[2].trim(),
      });
    }
    text = text.replace(createFolderRegex, "");

    // Parse code blocks that should be applied
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks: { language: string; code: string }[] = [];
    while ((match = codeBlockRegex.exec(content)) !== null) {
      codeBlocks.push({
        language: match[1] || language,
        code: match[2].trim(),
      });
    }

    // If there's code block and context suggests it should be applied
    if (codeBlocks.length > 0) {
      codeBlocks.forEach((block, index) => {
        actions.push({
          type: "apply_code",
          content: block.code,
          language: block.language,
          description: `Code block #${index + 1}`,
        });
      });
    }

    return { text: text.trim(), actions };
  };

  const askGoogleDirect = async (enhancedPrompt: string): Promise<string> => {
    if (!directGoogleKey) {
      throw new Error("AI key is not configured.");
    }

    let modelsToTry = [...DIRECT_GOOGLE_MODEL_CANDIDATES];
    try {
      const listResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${directGoogleKey}`
      );
      if (listResp.ok) {
        const listData = await listResp.json();
        const apiModels = (listData?.models || [])
          .filter((m: any) =>
            Array.isArray(m?.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes("generateContent")
          )
          .map((m: any) => String(m?.name || "").replace(/^models\//, ""))
          .filter(Boolean);

        if (apiModels.length > 0) {
          const preferred = DIRECT_GOOGLE_MODEL_CANDIDATES.filter((m) => apiModels.includes(m));
          modelsToTry = preferred.length > 0 ? preferred : apiModels;
        }
      }
    } catch {
      // Keep default candidates if listing models fails.
    }

    let lastError = "Failed to get response from Google AI.";
    for (const model of modelsToTry) {
      try {
        const googleResponse = await fetch(buildGoogleGenerateUrl(model, directGoogleKey), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: enhancedPrompt }] }],
          }),
        });

        if (!googleResponse.ok) {
          const errorText = await googleResponse.text();
          const normalized = normalizeAiErrorMessage(errorText);

          // Stop early on quota/auth errors, retry only for model-related failures.
          if (googleResponse.status === 429 || googleResponse.status === 401 || googleResponse.status === 403) {
            throw new Error(normalized);
          }

          if (googleResponse.status === 404 || errorText.toLowerCase().includes("not found")) {
            lastError = errorText;
            continue;
          }

          throw new Error(normalized);
        }

        const googleData = await googleResponse.json();
        const responseText = googleData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (responseText) {
          return responseText;
        }

        lastError = "Google AI returned an empty response.";
      } catch (error: any) {
        lastError = error?.message || "Google AI request failed.";
      }
    }

    throw new Error(normalizeAiErrorMessage(lastError));
  };

  const askOpenRouterDirect = async (enhancedPrompt: string): Promise<string> => {
    if (!openRouterKey) {
      throw new Error("OpenRouter key is not configured.");
    }

    let modelsToTry = [...OPENROUTER_MODEL_CANDIDATES];
    try {
      const modelsResponse = await fetch("https://openrouter.ai/api/v1/models");
      if (modelsResponse.ok) {
        const modelsData = await modelsResponse.json();
        const freeModels = (modelsData?.data || [])
          .map((m: any) => {
            const id = String(m?.id || "");
            const promptPrice = Number(m?.pricing?.prompt ?? NaN);
            const completionPrice = Number(m?.pricing?.completion ?? NaN);
            const isFreeById = id.endsWith(":free");
            const isFreeByPricing =
              Number.isFinite(promptPrice) &&
              Number.isFinite(completionPrice) &&
              promptPrice === 0 &&
              completionPrice === 0;
            return { id, isFree: isFreeById || isFreeByPricing };
          })
          .filter((m: { id: string; isFree: boolean }) => m.isFree && m.id)
          .map((m: { id: string }) => m.id);

        if (freeModels.length > 0) {
          const preferred = OPENROUTER_MODEL_CANDIDATES.filter((m) => freeModels.includes(m));
          const ordered = preferred.length > 0 ? [...preferred, ...freeModels] : freeModels;
          modelsToTry = Array.from(new Set(ordered));
        }
      }
    } catch {
      // Keep static fallback list when models endpoint is unavailable.
    }

    let lastError = "OpenRouter request failed.";
    for (const model of modelsToTry) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openRouterKey}`,
            "HTTP-Referer": window.location.origin,
            "X-Title": "CodeForge",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: enhancedPrompt }],
            temperature: 0.7,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const normalized = normalizeAiErrorMessage(`OpenRouter: ${errorText}`);
          if (response.status === 429 || response.status === 402 || response.status === 401 || response.status === 403) {
            throw new Error(normalized);
          }
          lastError = normalized;
          continue;
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) {
          return text;
        }

        lastError = "OpenRouter returned an empty response.";
      } catch (error: any) {
        lastError = error?.message || "OpenRouter request failed.";
      }
    }

    throw new Error(normalizeAiErrorMessage(lastError));
  };

  const askAnyDirectProvider = async (enhancedPrompt: string): Promise<string> => {
    if (directGoogleKey) {
      try {
        return await askGoogleDirect(enhancedPrompt);
      } catch (error) {
        if (!openRouterKey) {
          throw error;
        }
      }
    }

    if (openRouterKey) {
      return await askOpenRouterDirect(enhancedPrompt);
    }

    throw new Error("No direct AI keys configured. Add VITE_GOOGLE_AI_KEY or VITE_OPENROUTER_API_KEY.");
  };

  const sendMessage = async (prompt: string) => {
    if (!prompt.trim() || isLoading) return;

    // Check if AI is disabled for this user
    if (aiDisabled) {
      toast({
        title: "AI disabled",
        description: "Your access to AI has been disabled by an admin",
        variant: "destructive",
      });
      return;
    }

    const userMessage: Message = {
      role: "user",
      content: prompt,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Build context about current project
      const fileList = files.map(f => `${f.is_folder ? "📁" : "📄"} ${f.path}${f.name}`).join("\n");
      const enhancedPrompt = `
User request: ${prompt}

Current project context:
- Active file: ${activeFile?.name || "None"} (${activeFile?.language || "unknown"})
- All files:
${fileList}

Current code:
\`\`\`${language}
${code || "// No code yet"}
\`\`\`

Rules:
1. If the user asks to create a new file, include [CREATE_FILE: file_name, path, language] in your response
2. If the user asks to create a new folder, include [CREATE_FOLDER: folder_name, path] in your response
3. If you provide code, wrap it in \`\`\` blocks so the user can insert it using the "Apply code" button
4. You can also help combine HTML, CSS, and JavaScript files
`;

      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { prompt: enhancedPrompt, code, language },
      });

      if (error) {
        let detailedMessage = error.message || "Edge function call failed";
        const ctx = (error as any)?.context;

        if (ctx) {
          try {
            const payload = await ctx.json();
            if (payload?.error) {
              detailedMessage = payload.error;
            } else if (payload?.message) {
              detailedMessage = payload.message;
            }
          } catch {
            try {
              const text = await ctx.text();
              if (text) detailedMessage = text;
            } catch {
              // Keep original message
            }
          }
        }

        const normalized = normalizeAiErrorMessage(detailedMessage);
        if ((directGoogleKey || openRouterKey) && shouldUseDirectGoogleFallback(normalized)) {
          const responseText = await askAnyDirectProvider(enhancedPrompt);
          const { text, actions } = parseAIResponse(responseText);

          const assistantMessage: Message = {
            role: "assistant",
            content: text,
            timestamp: new Date(),
            actions: actions.length > 0 ? actions : undefined,
          };

          setMessages((prev) => [...prev, assistantMessage]);
          return;
        }

        throw new Error(normalized);
      }
      if (data?.error) {
        const normalized = normalizeAiErrorMessage(data.error);
        if ((directGoogleKey || openRouterKey) && shouldUseDirectGoogleFallback(normalized)) {
          const responseText = await askAnyDirectProvider(enhancedPrompt);
          const { text, actions } = parseAIResponse(responseText);

          const assistantMessage: Message = {
            role: "assistant",
            content: text,
            timestamp: new Date(),
            actions: actions.length > 0 ? actions : undefined,
          };

          setMessages((prev) => [...prev, assistantMessage]);
          return;
        }

        throw new Error(normalized);
      }

      const responseText = data.response || "Failed to get response";
      const { text, actions } = parseAIResponse(responseText);

      const assistantMessage: Message = {
        role: "assistant",
        content: text,
        timestamp: new Date(),
        actions: actions.length > 0 ? actions : undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("AI error:", error);
      const message =
        error?.message?.includes("Failed to send a request to the Edge Function")
          ? "AI service is unreachable. Make sure Supabase functions are running and keys are configured."
          : normalizeAiErrorMessage(error?.message || "Something went wrong. Please try again.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: message,
          timestamp: new Date(),
        },
      ]);
      toast({
        title: "AI error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (action: AIAction) => {
    try {
      switch (action.type) {
        case "create_file":
          if (action.name && action.path) {
            await onCreateFile(action.name, action.path, false, action.language, "");
            toast({
              title: "File created!",
              description: `${action.name} was created successfully`,
            });
          }
          break;
        case "create_folder":
          if (action.name && action.path) {
            await onCreateFile(action.name, action.path, true);
            toast({
              title: "Folder created!",
              description: `${action.name} folder was created successfully`,
            });
          }
          break;
        case "apply_code":
          if (action.content && activeFile) {
            onUpdateFileContent(activeFile.id, action.content);
            toast({
              title: "Code applied!",
              description: "Code updated successfully",
            });
          } else if (!activeFile) {
            toast({
              title: "Error",
              description: "Select a file first",
              variant: "destructive",
            });
          }
          break;
      }
    } catch (error) {
      console.error("Action error:", error);
      toast({
        title: "Error",
        description: "Failed to execute action",
        variant: "destructive",
      });
    }
  };

  const copyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const clearChat = () => {
    setMessages([]);
  };

  // If AI is disabled, don't render anything
  if (aiDisabled) {
    return null;
  }

  return (
    <>
      {/* Toggle Button */}
      <motion.div
        className="fixed bottom-4 right-[132px] z-50"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "h-12 w-12 rounded-xl shadow-lg transition-all duration-200",
            "flex items-center justify-center backdrop-blur-sm",
            isOpen
              ? "bg-primary/20 text-primary border border-primary/50 glow-sm"
              : "bg-card/90 text-primary border border-border hover:border-primary/50 hover:bg-card hover:glow-sm"
          )}
          title={`Developed by ${author}`}
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
            className={`fixed z-50 bg-card border border-border rounded-2xl shadow-2xl shadow-primary/10 overflow-hidden flex flex-col ${
              isExpanded 
                ? "bottom-4 right-4 left-4 top-4 md:bottom-6 md:right-6 md:left-auto md:top-6 md:w-[750px]" 
                : "bottom-20 right-4 w-[95vw] md:w-[420px] lg:w-[480px] h-[70vh] md:h-[600px]"
            }`}
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-primary/20 to-transparent border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      CodeForge AI
                      <span className="inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold bg-secondary text-secondary-foreground">
                        Free
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Write code, create files, optimize faster
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    title={isExpanded ? "Minimize" : "Maximize"}
                  >
                    {isExpanded ? (
                      <Minimize2 className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Maximize2 className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    onClick={clearChat}
                    className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    title="Clear chat"
                  >
                    <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    title="Close"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <Wand2 className="h-12 w-12 mx-auto text-primary/50 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      A powerful assistant like GitHub Copilot!
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Create files, write code, and optimize quickly
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {quickPrompts.map((item, index) => (
                      <motion.button
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => sendMessage(item.prompt)}
                        className="flex items-center gap-2 p-3 rounded-lg bg-background/50 hover:bg-background/80 border border-border transition-colors text-left"
                      >
                        <item.icon className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-xs">{item.label}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback
                          className={
                            msg.role === "user"
                              ? "bg-primary/20 text-primary"
                              : "bg-accent/20 text-accent"
                          }
                        >
                          {msg.role === "user" ? "U" : <Bot className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-2">
                        <div
                          className={`p-3 rounded-xl text-sm ${
                            msg.role === "user"
                              ? "bg-primary/20 text-foreground"
                              : "bg-background/50 border border-border"
                          }`}
                        >
                          {msg.role === "assistant" ? (
                            <div className="prose prose-sm prose-invert max-w-none">
                              <ReactMarkdown
                                components={{
                                  code({ className, children, ...props }) {
                                    const isCodeBlock = className?.includes("language-");
                                    if (isCodeBlock) {
                                      const codeString = String(children).replace(/\n$/, "");
                                      return (
                                        <div className="relative group">
                                          <pre className="bg-background/80 p-3 rounded-lg overflow-x-auto text-xs">
                                            <code {...props}>{children}</code>
                                          </pre>
                                          <button
                                            onClick={() => copyCode(codeString, index)}
                                            className="absolute top-2 right-2 p-1.5 rounded bg-muted/80 opacity-0 group-hover:opacity-100 transition-opacity"
                                          >
                                            {copiedIndex === index ? (
                                              <Check className="h-3 w-3 text-green-400" />
                                            ) : (
                                              <Copy className="h-3 w-3" />
                                            )}
                                          </button>
                                        </div>
                                      );
                                    }
                                    return (
                                      <code
                                        className="bg-background/80 px-1.5 py-0.5 rounded text-xs font-mono"
                                        {...props}
                                      >
                                        {children}
                                      </code>
                                    );
                                  },
                                  pre({ children }) {
                                    return <>{children}</>;
                                  },
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            msg.content
                          )}
                        </div>

                        {/* Action buttons */}
                        {msg.actions && msg.actions.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {msg.actions.map((action, actionIndex) => (
                              <motion.button
                                key={actionIndex}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-xs font-medium transition-colors"
                                onClick={() => handleAction(action)}
                              >
                                {action.type === "create_file" && (
                                  <>
                                    <FilePlus className="h-3.5 w-3.5 text-primary" />
                                    <span>Create {action.name}</span>
                                  </>
                                )}
                                {action.type === "create_folder" && (
                                  <>
                                    <FolderPlus className="h-3.5 w-3.5 text-primary" />
                                    <span>{action.name} folder</span>
                                  </>
                                )}
                                {action.type === "apply_code" && (
                                  <>
                                    <FileCode className="h-3.5 w-3.5 text-accent" />
                                    <span>Apply code</span>
                                  </>
                                )}
                              </motion.button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex gap-3"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-accent/20 text-accent">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 p-3 rounded-xl bg-background/50 border border-border">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Analyzing code...
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Create a file, write code, find bugs..."
                  className="flex-1 bg-background/50"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={isLoading || !input.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Tip: try "create index.html" or "optimize this code"
              </p>
            </form>

            {/* Footer */}
            <div className="text-xs text-muted-foreground text-center p-2 border-t border-border">
              Developed by {author}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIAssistant;
