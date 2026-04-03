import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";

// ==================== TYPES & INTERFACES ====================

interface CursorPosition {
  line: number;
  column: number;
}

interface FileItem {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  is_folder: boolean;
  size?: number;
}

interface CompletionResult {
  completion: string;
  type: "inline" | "block" | "line";
  confidence: number;
  metadata?: {
    model: string;
    tokens: number;
    latency: number;
  };
}

interface CompletionContext {
  prefix: string;
  suffix: string;
  currentLine: string;
  indentation: string;
  languageFeatures: string[];
  recentEdits: { line: number; content: string; timestamp: number }[];
}

interface AICompletionOptions {
  maxTokens?: number;
  temperature?: number;
  includeSuffix?: boolean;
  streaming?: boolean;
  timeout?: number;
}

interface CompletionCacheEntry {
  result: string;
  timestamp: number;
  contextHash: string;
}

// ==================== CONSTANTS ====================

const COMPLETION_CACHE_DURATION = 30000; // 30 seconds
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;
const DEBOUNCE_DELAY = 300;
const MAX_CACHE_SIZE = 100;

const LANGUAGE_PATTERNS: Record<string, {
  keywords: string[];
  triggers: string[];
  indentation: string;
}> = {
  typescript: {
    keywords: ["function", "const", "let", "class", "interface", "type", "enum", "return", "if", "else", "for", "while", "try", "catch", "export", "import", "from"],
    triggers: [".", "=>", "(", "{", "[", " ", "\n"],
    indentation: "  ",
  },
  python: {
    keywords: ["def", "class", "import", "from", "return", "if", "elif", "else", "for", "while", "try", "except", "with", "as"],
    triggers: [".", ":", " ", "\n"],
    indentation: "    ",
  },
  javascript: {
    keywords: ["function", "const", "let", "class", "return", "if", "else", "for", "while", "try", "catch", "export", "import", "from"],
    triggers: [".", "=>", "(", "{", "[", " ", "\n"],
    indentation: "  ",
  },
  html: {
    keywords: ["div", "span", "class", "id", "style", "onclick", "href", "src", "alt"],
    triggers: ["<", "</", " ", "=", ">"],
    indentation: "  ",
  },
  css: {
    keywords: ["display", "position", "color", "background", "margin", "padding", "border", "width", "height", "flex", "grid"],
    triggers: [":", ";", "{", "}", " ", "\n"],
    indentation: "  ",
  },
};

// ==================== UTILITY FUNCTIONS ====================

const generateContextHash = (code: string, cursorPosition: CursorPosition): string => {
  const relevantCode = code.substring(
    Math.max(0, cursorPosition.line * 100 - 500),
    cursorPosition.line * 100 + 200
  );
  return `${relevantCode}:${cursorPosition.line}:${cursorPosition.column}`;
};

const extractContext = (code: string, cursorPosition: CursorPosition): CompletionContext => {
  const lines = code.split("\n");
  const currentLine = lines[cursorPosition.line] || "";
  const prefix = currentLine.substring(0, cursorPosition.column);
  const suffix = currentLine.substring(cursorPosition.column);
  
  // Calculate indentation
  const indentationMatch = prefix.match(/^\s*/);
  const indentation = indentationMatch ? indentationMatch[0] : "";
  
  // Detect language features from context
  const languageFeatures: string[] = [];
  if (prefix.includes("function") || prefix.includes("=>")) languageFeatures.push("function");
  if (prefix.includes("class")) languageFeatures.push("class");
  if (prefix.includes("import") || prefix.includes("require")) languageFeatures.push("import");
  if (prefix.includes("return")) languageFeatures.push("return");
  
  return {
    prefix,
    suffix,
    currentLine,
    indentation,
    languageFeatures,
    recentEdits: [],
  };
};

const detectLanguageFromCode = (code: string, language: string): string => {
  if (language && LANGUAGE_PATTERNS[language.toLowerCase()]) {
    return language.toLowerCase();
  }
  
  // Auto-detect from code
  if (code.includes("function") && code.includes("const")) return "typescript";
  if (code.includes("def ") && code.includes(":")) return "python";
  if (code.includes("<div") && code.includes("</div>")) return "html";
  if (code.includes("{") && code.includes("}") && code.includes(":")) return "css";
  
  return "typescript";
};

const postProcessCompletion = (completion: string, context: CompletionContext): string => {
  let processed = completion;
  
  // Remove duplicate indentation
  if (context.indentation && processed.startsWith(context.indentation)) {
    processed = processed.substring(context.indentation.length);
  }
  
  // Fix common issues
  processed = processed.replace(/\s+$/g, ""); // Remove trailing spaces
  processed = processed.replace(/^\n+/, ""); // Remove leading newlines
  
  // Ensure proper line endings
  if (context.prefix && !context.prefix.endsWith(" ") && processed.startsWith(" ")) {
    processed = processed.trimStart();
  }
  
  // Add semicolon for JavaScript/TypeScript if needed
  const language = context.languageFeatures.includes("import") ? "typescript" : "javascript";
  if (["javascript", "typescript"].includes(language) && 
      !processed.includes(";") && 
      processed.length < 50) {
    processed += ";";
  }
  
  return processed;
};

// ==================== MAIN HOOK ====================

export const useAICompletions = () => {
  // State
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentSuggestion, setCurrentSuggestion] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [lastCompletionTime, setLastCompletionTime] = useState<number>(0);
  
  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const rateLimitCountRef = useRef<number>(0);
  const rateLimitResetRef = useRef<number>(Date.now());
  const completionCacheRef = useRef<Map<string, CompletionCacheEntry>>(new Map());
  const requestQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isProcessingQueueRef = useRef(false);
  
  // Hooks
  const { toast } = useToast();

  // Clean up old cache entries periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of completionCacheRef.current.entries()) {
        if (now - entry.timestamp > COMPLETION_CACHE_DURATION) {
          completionCacheRef.current.delete(key);
        }
      }
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Process request queue
  const processQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;
    
    while (requestQueueRef.current.length > 0) {
      const request = requestQueueRef.current.shift();
      if (request) {
        await request();
      }
    }
    
    isProcessingQueueRef.current = false;
  }, []);

  // Check rate limit
  const checkRateLimit = useCallback((): boolean => {
    const now = Date.now();
    if (now - rateLimitResetRef.current > RATE_LIMIT_WINDOW) {
      rateLimitCountRef.current = 0;
      rateLimitResetRef.current = now;
    }
    
    if (rateLimitCountRef.current >= MAX_REQUESTS_PER_WINDOW) {
      const waitTime = rateLimitResetRef.current + RATE_LIMIT_WINDOW - now;
      toast({
        title: "Rate Limit Reached",
        description: `Please wait ${Math.ceil(waitTime / 1000)} seconds before making more requests`,
        variant: "destructive",
      });
      return false;
    }
    
    rateLimitCountRef.current++;
    return true;
  }, [toast]);

  // Get cached completion
  const getCachedCompletion = useCallback((code: string, cursorPosition: CursorPosition): string | null => {
    const contextHash = generateContextHash(code, cursorPosition);
    const cached = completionCacheRef.current.get(contextHash);
    
    if (cached && Date.now() - cached.timestamp < COMPLETION_CACHE_DURATION) {
      return cached.result;
    }
    
    return null;
  }, []);

  // Cache completion
  const cacheCompletion = useCallback((code: string, cursorPosition: CursorPosition, result: string) => {
    const contextHash = generateContextHash(code, cursorPosition);
    
    // Limit cache size
    if (completionCacheRef.current.size >= MAX_CACHE_SIZE) {
      const oldestKey = completionCacheRef.current.keys().next().value;
      completionCacheRef.current.delete(oldestKey);
    }
    
    completionCacheRef.current.set(contextHash, {
      result,
      timestamp: Date.now(),
      contextHash,
    });
  }, []);

  // Core completion function
  const getInlineCompletion = useCallback(
    async (
      code: string,
      language: string,
      cursorPosition: CursorPosition,
      files?: FileItem[],
      options: AICompletionOptions = {}
    ): Promise<CompletionResult | null> => {
      // Check cache first
      const cachedResult = getCachedCompletion(code, cursorPosition);
      if (cachedResult) {
        setCurrentSuggestion(cachedResult);
        setConfidence(0.9);
        return {
          completion: cachedResult,
          type: "inline",
          confidence: 0.9,
        };
      }
      
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      
      // Check rate limit
      if (!checkRateLimit()) {
        return null;
      }
      
      // Set timeout
      const timeout = options.timeout || 5000;
      const timeoutId = setTimeout(() => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      }, timeout);
      
      setIsLoading(true);
      setCurrentSuggestion(null);
      
      const startTime = Date.now();
      const detectedLanguage = detectLanguageFromCode(code, language);
      const context = extractContext(code, cursorPosition);
      
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: {
            code,
            language: detectedLanguage,
            cursorPosition,
            projectContext: files ? { files: files.slice(0, 20) } : null,
            type: "inline",
            context: {
              prefix: context.prefix,
              suffix: context.suffix,
              indentation: context.indentation,
              languageFeatures: context.languageFeatures,
            },
            maxTokens: options.maxTokens || 150,
            temperature: options.temperature || 0.2,
            includeSuffix: options.includeSuffix || false,
            streaming: options.streaming || false,
          },
          signal: abortControllerRef.current.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (error) {
          console.error("Completion error:", error);
          return null;
        }
        
        if (data?.error) {
          console.error("Completion error:", data.error);
          return null;
        }
        
        const rawCompletion = data?.completion || data?.suggestion || null;
        const completionType = data?.type || "inline";
        const confidenceScore = data?.confidence || 0.7;
        
        if (rawCompletion) {
          const processedCompletion = postProcessCompletion(rawCompletion, context);
          setCurrentSuggestion(processedCompletion);
          setConfidence(confidenceScore);
          setLastCompletionTime(Date.now() - startTime);
          
          // Cache the result
          cacheCompletion(code, cursorPosition, processedCompletion);
          
          const result: CompletionResult = {
            completion: processedCompletion,
            type: completionType,
            confidence: confidenceScore,
            metadata: {
              model: data?.model || "gpt-4",
              tokens: data?.tokens || 0,
              latency: Date.now() - startTime,
            },
          };
          
          return result;
        }
        
        return null;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name !== "AbortError") {
          console.error("Completion request failed:", error);
        }
        return null;
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [checkRateLimit, getCachedCompletion, cacheCompletion]
  );

  // Get multiple suggestions
  const getMultipleSuggestions = useCallback(
    async (
      code: string,
      language: string,
      cursorPosition: CursorPosition,
      count: number = 3,
      files?: FileItem[]
    ): Promise<string[]> => {
      if (!checkRateLimit()) return [];
      
      setIsLoading(true);
      
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: {
            code,
            language: detectLanguageFromCode(code, language),
            cursorPosition,
            projectContext: files ? { files: files.slice(0, 20) } : null,
            type: "multiple",
            count,
            temperature: 0.8, // Higher temperature for diversity
          },
        });
        
        if (error) throw error;
        
        const suggestionsList = data?.suggestions || [];
        setSuggestions(suggestionsList);
        setActiveSuggestionIndex(0);
        if (suggestionsList.length > 0) {
          setCurrentSuggestion(suggestionsList[0]);
        }
        
        return suggestionsList;
      } catch (error) {
        console.error("Multiple suggestions error:", error);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [checkRateLimit]
  );

  // Cycle through suggestions
  const nextSuggestion = useCallback(() => {
    if (suggestions.length === 0) return;
    const nextIndex = (activeSuggestionIndex + 1) % suggestions.length;
    setActiveSuggestionIndex(nextIndex);
    setCurrentSuggestion(suggestions[nextIndex]);
  }, [suggestions, activeSuggestionIndex]);

  const previousSuggestion = useCallback(() => {
    if (suggestions.length === 0) return;
    const prevIndex = (activeSuggestionIndex - 1 + suggestions.length) % suggestions.length;
    setActiveSuggestionIndex(prevIndex);
    setCurrentSuggestion(suggestions[prevIndex]);
  }, [suggestions, activeSuggestionIndex]);

  // Smart completion based on context
  const getSmartCompletion = useCallback(
    async (
      code: string,
      language: string,
      cursorPosition: CursorPosition,
      files?: FileItem[]
    ): Promise<string | null> => {
      const context = extractContext(code, cursorPosition);
      const pattern = LANGUAGE_PATTERNS[detectLanguageFromCode(code, language)];
      
      // Check for common patterns
      if (context.prefix.endsWith(".")) {
        // Property access - suggest properties
        const objName = context.prefix.match(/(\w+)\.$/)?.[1];
        if (objName) {
          // Try to find object type from project files
          const relevantFile = files?.find(f => 
            f.content.includes(objName) && 
            (f.content.includes("class") || f.content.includes("interface"))
          );
          
          if (relevantFile) {
            const properties = relevantFile.content.match(/(\w+)\s*[:=]/g);
            if (properties && properties.length > 0) {
              const suggestion = properties[0].replace(/[:=]/, "");
              return suggestion;
            }
          }
        }
      }
      
      if (context.prefix.endsWith("(")) {
        // Function call - suggest parameters
        const funcName = context.prefix.match(/(\w+)\($/)?.[1];
        if (funcName) {
          // Suggest based on function name
          return "params";
        }
      }
      
      // Fall back to AI completion
      const result = await getInlineCompletion(code, language, cursorPosition, files);
      return result?.completion || null;
    },
    [getInlineCompletion]
  );

  // Code explanation with line highlighting
  const explainCode = useCallback(
    async (code: string, language: string, lineRange?: { start: number; end: number }): Promise<string | null> => {
      if (!checkRateLimit()) return null;
      
      setIsLoading(true);
      try {
        const selectedCode = lineRange 
          ? code.split("\n").slice(lineRange.start - 1, lineRange.end).join("\n")
          : code;
        
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: {
            code: selectedCode,
            language: detectLanguageFromCode(code, language),
            type: "explain",
            lineRange,
            detailed: true,
          },
        });
        
        if (error) throw error;
        
        const explanation = data?.completion || data?.explanation || null;
        
        toast({
          title: "Code Explanation",
          description: "Explanation generated successfully",
          variant: "default",
        });
        
        return explanation;
      } catch (error) {
        console.error("Explain code error:", error);
        toast({
          title: "Error",
          description: "Failed to explain code",
          variant: "destructive",
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [checkRateLimit, toast]
  );

  // Advanced code fixing with error analysis
  const fixCode = useCallback(
    async (
      code: string, 
      language: string, 
      errors?: { line: number; message: string }[]
    ): Promise<{ fixedCode: string; changes: string[] } | null> => {
      if (!checkRateLimit()) return null;
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: {
            code,
            language: detectLanguageFromCode(code, language),
            type: "fix",
            errors,
            includeExplanation: true,
          },
        });
        
        if (error) throw error;
        
        const result = {
          fixedCode: data?.completion || code,
          changes: data?.changes || [],
        };
        
        toast({
          title: "Code Fixed",
          description: `${result.changes.length} issues resolved`,
          variant: "default",
        });
        
        return result;
      } catch (error) {
        console.error("Fix code error:", error);
        toast({
          title: "Error",
          description: "Failed to fix code",
          variant: "destructive",
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [checkRateLimit, toast]
  );

  // Generate comprehensive tests
  const generateTests = useCallback(
    async (
      code: string, 
      language: string,
      framework: "jest" | "mocha" | "pytest" | "vitest" = "jest"
    ): Promise<{ testCode: string; coverage: number } | null> => {
      if (!checkRateLimit()) return null;
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: {
            code,
            language: detectLanguageFromCode(code, language),
            type: "tests",
            framework,
            generateEdgeCases: true,
          },
        });
        
        if (error) throw error;
        
        const result = {
          testCode: data?.completion || "",
          coverage: data?.coverage || 70,
        };
        
        toast({
          title: "Tests Generated",
          description: `${result.coverage}% estimated coverage`,
          variant: "default",
        });
        
        return result;
      } catch (error) {
        console.error("Generate tests error:", error);
        toast({
          title: "Error",
          description: "Failed to generate tests",
          variant: "destructive",
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [checkRateLimit, toast]
  );

  // Smart refactoring with suggestions
  const refactorCode = useCallback(
    async (
      code: string, 
      language: string,
      patterns?: string[]
    ): Promise<{ refactoredCode: string; suggestions: string[]; improvements: string[] } | null> => {
      if (!checkRateLimit()) return null;
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: {
            code,
            language: detectLanguageFromCode(code, language),
            type: "refactor",
            patterns,
            suggestions: true,
          },
        });
        
        if (error) throw error;
        
        const result = {
          refactoredCode: data?.completion || code,
          suggestions: data?.suggestions || [],
          improvements: data?.improvements || [],
        };
        
        toast({
          title: "Refactoring Complete",
          description: `${result.suggestions.length} improvements suggested`,
          variant: "default",
        });
        
        return result;
      } catch (error) {
        console.error("Refactor code error:", error);
        toast({
          title: "Error",
          description: "Failed to refactor code",
          variant: "destructive",
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [checkRateLimit, toast]
  );

  // Generate documentation
  const generateDocs = useCallback(
    async (
      code: string, 
      language: string,
      format: "jsdoc" | "typedoc" | "sphinx" | "markdown" = "markdown"
    ): Promise<string | null> => {
      if (!checkRateLimit()) return null;
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: {
            code,
            language: detectLanguageFromCode(code, language),
            type: "docs",
            format,
            includeExamples: true,
          },
        });
        
        if (error) throw error;
        
        const docs = data?.completion || null;
        
        toast({
          title: "Documentation Generated",
          description: `Documentation created in ${format} format`,
          variant: "default",
        });
        
        return docs;
      } catch (error) {
        console.error("Generate docs error:", error);
        toast({
          title: "Error",
          description: "Failed to generate documentation",
          variant: "destructive",
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [checkRateLimit, toast]
  );

  // Find bugs in code
  const findBugs = useCallback(
    async (code: string, language: string): Promise<{ line: number; message: string; severity: "low" | "medium" | "high"; suggestion: string }[] | null> => {
      if (!checkRateLimit()) return null;
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: {
            code,
            language: detectLanguageFromCode(code, language),
            type: "debug",
            findBugs: true,
          },
        });
        
        if (error) throw error;
        
        const bugs = data?.bugs || [];
        
        if (bugs.length > 0) {
          toast({
            title: "Bugs Found",
            description: `${bugs.length} potential issues detected`,
            variant: "destructive",
          });
        }
        
        return bugs;
      } catch (error) {
        console.error("Find bugs error:", error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [checkRateLimit, toast]
  );

  // Code review
  const reviewCode = useCallback(
    async (code: string, language: string): Promise<{ rating: number; comments: string[]; suggestions: string[] } | null> => {
      if (!checkRateLimit()) return null;
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: {
            code,
            language: detectLanguageFromCode(code, language),
            type: "review",
          },
        });
        
        if (error) throw error;
        
        return {
          rating: data?.rating || 0,
          comments: data?.comments || [],
          suggestions: data?.suggestions || [],
        };
      } catch (error) {
        console.error("Review code error:", error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [checkRateLimit]
  );

  // Utility functions
  const clearSuggestion = useCallback(() => {
    setCurrentSuggestion(null);
    setSuggestions([]);
    setActiveSuggestionIndex(0);
    setConfidence(0);
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setIsStreaming(false);
  }, []);

  const acceptSuggestion = useCallback((): string | null => {
    const suggestion = currentSuggestion;
    clearSuggestion();
    return suggestion;
  }, [currentSuggestion, clearSuggestion]);

  const getCompletionStats = useCallback(() => {
    return {
      cacheSize: completionCacheRef.current.size,
      rateLimitRemaining: MAX_REQUESTS_PER_WINDOW - rateLimitCountRef.current,
      lastCompletionTime,
      isRateLimited: rateLimitCountRef.current >= MAX_REQUESTS_PER_WINDOW,
    };
  }, [lastCompletionTime]);

  return {
    // State
    isLoading,
    isStreaming,
    currentSuggestion,
    suggestions,
    activeSuggestionIndex,
    confidence,
    
    // Core completion methods
    getInlineCompletion,
    getMultipleSuggestions,
    getSmartCompletion,
    
    // Navigation
    nextSuggestion,
    previousSuggestion,
    
    // Code analysis methods
    explainCode,
    fixCode,
    generateTests,
    refactorCode,
    generateDocs,
    findBugs,
    reviewCode,
    
    // Utility methods
    clearSuggestion,
    cancelRequest,
    acceptSuggestion,
    getCompletionStats,
  };
};

// ==================== CUSTOM HOOKS FOR SPECIFIC USE CASES ====================

// Hook for real-time inline completions with debouncing
export const useRealTimeCompletions = (debounceDelay: number = DEBOUNCE_DELAY) => {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { getInlineCompletion } = useAICompletions();
  
  const debouncedGetCompletion = useDebounce(async (
    code: string,
    language: string,
    cursorPosition: CursorPosition,
    files?: FileItem[]
  ) => {
    setIsLoading(true);
    const result = await getInlineCompletion(code, language, cursorPosition, files);
    setSuggestion(result?.completion || null);
    setIsLoading(false);
  }, debounceDelay);
  
  return {
    suggestion,
    isLoading,
    getCompletion: debouncedGetCompletion,
    clearSuggestion: () => setSuggestion(null),
  };
};

// Hook for code analysis
export const useCodeAnalysis = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { explainCode, findBugs, reviewCode } = useAICompletions();
  
  const analyzeCode = useCallback(async (code: string, language: string) => {
    setIsAnalyzing(true);
    
    try {
      const [explanation, bugs, review] = await Promise.all([
        explainCode(code, language),
        findBugs(code, language),
        reviewCode(code, language),
      ]);
      
      return {
        explanation,
        bugs,
        review,
      };
    } finally {
      setIsAnalyzing(false);
    }
  }, [explainCode, findBugs, reviewCode]);
  
  return {
    analyzeCode,
    isAnalyzing,
  };
};

// Hook for code transformation
export const useCodeTransformation = () => {
  const [isTransforming, setIsTransforming] = useState(false);
  const { fixCode, refactorCode } = useAICompletions();
  
  const transformCode = useCallback(async (
    code: string,
    language: string,
    type: "fix" | "refactor",
    options?: any
  ) => {
    setIsTransforming(true);
    
    try {
      if (type === "fix") {
        return await fixCode(code, language, options?.errors);
      } else {
        return await refactorCode(code, language, options?.patterns);
      }
    } finally {
      setIsTransforming(false);
    }
  }, [fixCode, refactorCode]);
  
  return {
    transformCode,
    isTransforming,
  };
};
