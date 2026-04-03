import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// ==================== TYPES ====================

interface FileStructure {
  name: string;
  path: string;
  content: string;
  language: "html" | "css" | "typescript" | "javascript" | "tsx" | "jsx" | "json";
  is_entry?: boolean;
}

interface ProjectStructure {
  name: string;
  description: string;
  files: FileStructure[];
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

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
}

// ==================== CONSTANTS ====================

const PROJECT_TEMPLATES = {
  react: {
    name: "React App",
    files: [
      {
        name: "index.html",
        path: "/",
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>React App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`,
        language: "html" as const
      },
      {
        name: "main.tsx",
        path: "/src/",
        content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)`,
        language: "tsx" as const
      },
      {
        name: "App.tsx",
        path: "/src/",
        content: `import React, { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="app">
      <h1>Welcome to React</h1>
      <button onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    </div>
  )
}

export default App`,
        language: "tsx" as const
      },
      {
        name: "index.css",
        path: "/src/",
        content: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}`,
        language: "css" as const
      },
      {
        name: "App.css",
        path: "/src/",
        content: `.app {
  text-align: center;
  padding: 2rem;
}

h1 {
  color: white;
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

button {
  background: white;
  border: none;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: transform 0.2s;
}

button:hover {
  transform: scale(1.05);
}`,
        language: "css" as const
      },
      {
        name: "package.json",
        path: "/",
        content: `{
  "name": "react-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^4.0.0"
  }
}`,
        language: "json" as const
      },
      {
        name: "tsconfig.json",
        path: "/",
        content: `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}`,
        language: "json" as const
      },
      {
        name: "vite.config.ts",
        path: "/",
        content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  }
})`,
        language: "typescript" as const
      }
    ]
  },
  vue: {
    name: "Vue.js App",
    files: [
      {
        name: "index.html",
        path: "/",
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vue App</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>`,
        language: "html" as const
      },
      {
        name: "main.ts",
        path: "/src/",
        content: `import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')`,
        language: "typescript" as const
      },
      {
        name: "App.vue",
        path: "/src/",
        content: `<template>
  <div class="app">
    <h1>Welcome to Vue.js</h1>
    <button @click="count++">
      Count: {{ count }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
</script>

<style scoped>
.app {
  text-align: center;
  padding: 2rem;
}

h1 {
  color: #42b883;
  font-size: 2.5rem;
}

button {
  background: #42b883;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
}
</style>`,
        language: "tsx" as const
      },
      {
        name: "style.css",
        path: "/src/",
        content: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}`,
        language: "css" as const
      }
    ]
  },
  "full-stack": {
    name: "Full Stack App (Express + React)",
    files: [
      {
        name: "server.js",
        path: "/backend/",
        content: `const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.get('/api/users', (req, res) => {
  res.json([
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
  ]);
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`,
        language: "javascript" as const
      },
      {
        name: "package.json",
        path: "/backend/",
        content: `{
  "name": "backend",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}`,
        language: "json" as const
      },
      {
        name: "api.ts",
        path: "/frontend/src/services/",
        content: `const API_URL = 'http://localhost:5000/api';

export interface User {
  id: number;
  name: string;
  email: string;
}

export const api = {
  async getUsers(): Promise<User[]> {
    const response = await fetch(\`\${API_URL}/users\`);
    return response.json();
  },
  
  async checkHealth(): Promise<{ status: string }> {
    const response = await fetch(\`\${API_URL}/health\`);
    return response.json();
  }
};`,
        language: "typescript" as const
      }
    ]
  }
};

// ==================== MAIN HOOK ====================

export const useAICompletions = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [currentSuggestion, setCurrentSuggestion] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const rateLimitCooldownRef = useRef<number>(0);
  const { toast } = useToast();

  // ==================== PROJECT GENERATION ====================
  
  const generateFullProject = useCallback(
    async (
      description: string,
      template: "react" | "vue" | "full-stack" | "custom" = "react"
    ): Promise<ProjectStructure | null> => {
      setIsLoading(true);
      
      try {
        // First, try to use predefined templates
        if (template !== "custom" && PROJECT_TEMPLATES[template]) {
          toast({
            title: "Project Generated!",
            description: `${PROJECT_TEMPLATES[template].name} template created`,
          });
          return PROJECT_TEMPLATES[template];
        }
        
        // For custom projects, use AI to generate structure
        const { data, error } = await supabase.functions.invoke("ai-assistant", {
          body: {
            prompt: `Create a complete web development project based on: "${description}"
            
Return a JSON object with this exact structure:
{
  "name": "project-name",
  "description": "project description",
  "files": [
    {
      "name": "filename.tsx",
      "path": "/src/",
      "content": "full file content",
      "language": "tsx"
    }
  ],
  "dependencies": {},
  "scripts": {}
}

Create ALL necessary files for a complete web application including:
- HTML entry point
- Main app component
- CSS/styling files
- Configuration files (package.json, tsconfig.json, vite.config.js)
- Multiple components if needed
- API services if backend is needed
- Types/interfaces
- Utility functions

Generate REAL, WORKING code. Make it professional and production-ready.`,
            mode: "generate-project-structure",
            template,
          },
        });
        
        if (error) throw error;
        
        let projectData: ProjectStructure;
        
        // Parse AI response
        const responseText = data?.response || data?.completion || "";
        const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
        
        if (jsonMatch) {
          projectData = JSON.parse(jsonMatch[1]);
        } else {
          projectData = JSON.parse(responseText);
        }
        
        // Validate and ensure required files exist
        if (!projectData.files.some(f => f.name === "index.html")) {
          projectData.files.push(PROJECT_TEMPLATES.react.files[0]); // Add default index.html
        }
        
        if (!projectData.files.some(f => f.name.includes("App"))) {
          projectData.files.push(PROJECT_TEMPLATES.react.files[2]); // Add default App
        }
        
        toast({
          title: "Project Generated!",
          description: `${projectData.files.length} files created successfully`,
        });
        
        return projectData;
      } catch (error: any) {
        console.error("Project generation error:", error);
        toast({
          title: "Generation Failed",
          description: error.message || "Failed to generate project",
          variant: "destructive",
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  // ==================== COMPONENT GENERATION ====================
  
  const generateComponent = useCallback(
    async (
      name: string,
      type: "react" | "vue" | "web-component" = "react",
      props?: Record<string, string>
    ): Promise<FileStructure | null> => {
      setIsLoading(true);
      
      try {
        const { data, error } = await supabase.functions.invoke("ai-assistant", {
          body: {
            prompt: `Create a ${type} component named "${name}"${props ? ` with props: ${JSON.stringify(props)}` : ""}.
            
Return ONLY the file content, no explanations.
Make it modern, responsive, and include TypeScript types.
Add comments for complex logic.
Include styles (CSS-in-JS or separate based on best practices).
Make it reusable and production-ready.`,
            type: "generate-component",
            componentName: name,
            componentType: type,
          },
        });
        
        if (error) throw error;
        
        const content = data?.completion || data?.response || "";
        
        const fileExtension = type === "react" ? "tsx" : type === "vue" ? "vue" : "js";
        const filePath = `/src/components/${name}/`;
        
        const componentFile: FileStructure = {
          name: `${name}.${fileExtension}`,
          path: filePath,
          content,
          language: fileExtension as any,
        };
        
        toast({
          title: "Component Generated",
          description: `${name} component created`,
        });
        
        return componentFile;
      } catch (error: any) {
        console.error("Component generation error:", error);
        toast({
          title: "Generation Failed",
          description: error.message,
          variant: "destructive",
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  // ==================== MULTI-FILE GENERATION ====================
  
  const generateMultipleFiles = useCallback(
    async (
      description: string,
      count: number = 5
    ): Promise<FileStructure[]> => {
      setIsLoading(true);
      
      try {
        const { data, error } = await supabase.functions.invoke("ai-assistant", {
          body: {
            prompt: `Generate ${count} web development files based on: "${description}"

Return a JSON array of files:
[
  {
    "name": "filename.tsx",
    "path": "/src/",
    "content": "full file content",
    "language": "tsx"
  }
]

Generate REAL, WORKING code for each file.
Include different file types (components, services, types, styles, utils).
Make them work together as a cohesive system.`,
            mode: "generate-multiple-files",
            fileCount: count,
          },
        });
        
        if (error) throw error;
        
        let files: FileStructure[] = [];
        const responseText = data?.response || data?.completion || "";
        const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
        
        if (jsonMatch) {
          files = JSON.parse(jsonMatch[1]);
        } else {
          files = JSON.parse(responseText);
        }
        
        toast({
          title: "Files Generated",
          description: `${files.length} files created`,
        });
        
        return files;
      } catch (error: any) {
        console.error("Multi-file generation error:", error);
        toast({
          title: "Generation Failed",
          description: error.message,
          variant: "destructive",
        });
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  // ==================== CODE COMPLETION ====================
  
  const getInlineCompletion = useCallback(
    async (
      code: string,
      language: string,
      cursorPosition: CursorPosition,
      files?: FileItem[]
    ): Promise<string | null> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      if (Date.now() < rateLimitCooldownRef.current) {
        return null;
      }

      setIsLoading(true);
      setCurrentSuggestion(null);

      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: {
            code,
            language,
            cursorPosition,
            projectContext: files ? { files: files.slice(0, 20) } : null,
            type: "inline",
          },
        });

        if (error) {
          rateLimitCooldownRef.current = Date.now() + 60000;
          return null;
        }

        if (data?.error) {
          rateLimitCooldownRef.current = Date.now() + 60000;
          return null;
        }

        const suggestion = data?.completion || null;
        setCurrentSuggestion(suggestion);
        return suggestion;
      } catch (error: any) {
        rateLimitCooldownRef.current = Date.now() + 60000;
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // ==================== CODE ANALYSIS ====================
  
  const explainCode = useCallback(
    async (code: string, language: string): Promise<string | null> => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: { code, language, type: "explain" },
        });

        if (error) throw error;
        return data?.completion || null;
      } catch (error) {
        console.error("Explain code error:", error);
        toast({
          title: "Xatolik",
          description: "Kodni tushuntirishda xatolik",
          variant: "destructive",
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  const fixCode = useCallback(
    async (code: string, language: string): Promise<string | null> => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: { code, language, type: "fix" },
        });

        if (error) throw error;
        return data?.completion || null;
      } catch (error) {
        console.error("Fix code error:", error);
        toast({
          title: "Xatolik",
          description: "Kodni to'g'irlashda xatolik",
          variant: "destructive",
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  const generateTests = useCallback(
    async (code: string, language: string): Promise<string | null> => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: { code, language, type: "tests" },
        });

        if (error) throw error;
        return data?.completion || null;
      } catch (error) {
        console.error("Generate tests error:", error);
        toast({
          title: "Xatolik",
          description: "Test yaratishda xatolik",
          variant: "destructive",
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  const refactorCode = useCallback(
    async (code: string, language: string): Promise<string | null> => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: { code, language, type: "refactor" },
        });

        if (error) throw error;
        return data?.completion || null;
      } catch (error) {
        console.error("Refactor code error:", error);
        toast({
          title: "Xatolik",
          description: "Kodni refaktor qilishda xatolik",
          variant: "destructive",
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  const generateDocs = useCallback(
    async (code: string, language: string): Promise<string | null> => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("ai-completions", {
          body: { code, language, type: "docs" },
        });

        if (error) throw error;
        return data?.completion || null;
      } catch (error) {
        console.error("Generate docs error:", error);
        toast({
          title: "Xatolik",
          description: "Dokumentatsiya yaratishda xatolik",
          variant: "destructive",
        });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [toast]
  );

  // ==================== UTILITIES ====================
  
  const clearSuggestion = useCallback(() => {
    setCurrentSuggestion(null);
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    // State
    isLoading,
    currentSuggestion,
    
    // Project generation (ko'p faylli)
    generateFullProject,
    generateComponent,
    generateMultipleFiles,
    
    // Templates
    templates: PROJECT_TEMPLATES,
    
    // Code completions
    getInlineCompletion,
    
    // Code analysis
    explainCode,
    fixCode,
    generateTests,
    refactorCode,
    generateDocs,
    
    // Utilities
    clearSuggestion,
    cancelRequest,
  };
};

// ==================== EXAMPLE USAGE COMPONENT ====================

/*
// Qanday ishlatish:

const MyComponent = () => {
  const { 
    generateFullProject, 
    generateComponent, 
    generateMultipleFiles,
    isLoading 
  } = useAICompletions();

  // 1. To'liq React loyihasi yaratish
  const handleCreateReactApp = async () => {
    const project = await generateFullProject(
      "Create a todo list app with user authentication",
      "react"
    );
    
    if (project) {
      project.files.forEach(file => {
        onCreateFile(file.name, file.path, false, file.language, file.content);
      });
    }
  };

  // 2. Vue.js loyihasi
  const handleCreateVueApp = async () => {
    const project = await generateFullProject(
      "Create a dashboard with charts",
      "vue"
    );
    // Fayllarni yaratish...
  };

  // 3. Full-stack loyiha
  const handleCreateFullStack = async () => {
    const project = await generateFullProject(
      "E-commerce platform with products and cart",
      "full-stack"
    );
    // Fayllarni yaratish...
  };

  // 4. Alohida komponent yaratish
  const handleCreateComponent = async () => {
    const component = await generateComponent(
      "UserProfile",
      "react",
      { userId: "string", onUpdate: "function" }
    );
    
    if (component) {
      await onCreateFile(component.name, component.path, false, component.language, component.content);
    }
  };

  // 5. Bir nechta fayl yaratish
  const handleCreateMultipleFiles = async () => {
    const files = await generateMultipleFiles(
      "Create authentication system with login, register, and profile pages",
      8
    );
    
    for (const file of files) {
      await onCreateFile(file.name, file.path, false, file.language, file.content);
    }
  };

  return (
    <div>
      <button onClick={handleCreateReactApp} disabled={isLoading}>
        Create React App
      </button>
      <button onClick={handleCreateVueApp} disabled={isLoading}>
        Create Vue App
      </button>
      <button onClick={handleCreateFullStack} disabled={isLoading}>
        Create Full Stack App
      </button>
      <button onClick={handleCreateComponent} disabled={isLoading}>
        Add Component
      </button>
      <button onClick={handleCreateMultipleFiles} disabled={isLoading}>
        Generate Multiple Files
      </button>
    </div>
  );
};
*/
