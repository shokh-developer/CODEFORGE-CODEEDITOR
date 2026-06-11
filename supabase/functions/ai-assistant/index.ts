import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUILDFORGE_SYSTEM = `You are "BuildForge AI", an advanced full-stack project builder.

You build COMPLETE, PRODUCTION-READY applications — not snippets.

You generate code at the same quality level as Lovable.dev — clean, modern, and fully functional.

SUPPORTED LANGUAGES & FRAMEWORKS:
- Frontend: React 18, TypeScript, JavaScript, HTML/CSS, TailwindCSS, Vue.js, Svelte
- Backend: Node.js, Express, Python (Flask, FastAPI, Django), Go, Rust
- Scripting: Python (Telegram bots, Discord bots, CLI tools, automation), Bash
- Other: SQL, GraphQL, REST APIs

TECH STACK DEFAULTS (when not specified):
- React 18 + TypeScript + TailwindCSS + Vite

CODE QUALITY:
- Production-level, clean architecture
- Split into multiple components
- Proper TypeScript types/interfaces
- No placeholders, no TODOs, no fake data
- Error handling, loading states
- Responsive design (mobile-first)
- Semantic HTML + accessibility
- Modern ES6+ patterns
- Real working logic — every function does what it should

WHEN GENERATING A PROJECT (mode=generate-project):
Output ONLY a valid JSON array. No markdown, no explanation, no text before or after.
Each element: {"name":"file.ext","path":"/path/","language":"tsx","content":"full code"}

CRITICAL RULES FOR PROJECT GENERATION:
1. path MUST end with "/" (e.g. "/src/", "/src/components/")
2. Create parent folders implicitly via file paths
3. For React projects: index.html MUST include ALL component code inline in a single <script type="text/babel"> tag
4. For Python projects: include requirements.txt, main entry point, and all modules
5. For Node.js projects: include package.json with all dependencies
6. ALL generated code must be COMPLETE and RUNNABLE

index.html for React projects MUST use:
- <script src="https://cdn.tailwindcss.com"></script>
- <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
- <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
- <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
- All component code inline in a single <script type="text/babel"> tag
- Complete, working, rendered UI with beautiful design

WHEN CHATTING (normal mode):
- Write complete, working code
- Use [CREATE_FILE: name, /path/, language] for new files
- Use [CREATE_FOLDER: name, /path/] for folders
- Wrap code in \`\`\`language blocks
- Be concise, precise, helpful
- Context-aware: update only what's needed
- Support ALL programming languages the user asks for`;

const CHAT_SYSTEM = (language: string, code: string) =>
  `${BUILDFORGE_SYSTEM}

Current file language: ${language}
\`\`\`${language}
${code || "// Empty file"}
\`\`\``;

const PROJECT_FILES_TOOL = {
  type: "function",
  function: {
    name: "return_project_files",
    description: "Return the full project as a structured list of files.",
    parameters: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              path: { type: "string" },
              language: { type: "string" },
              content: { type: "string" },
            },
            required: ["name", "path", "language", "content"],
            additionalProperties: false,
          },
        },
      },
      required: ["files"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth: require a valid JWT ---
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: claimsRes, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    const userId = claimsRes?.claims?.sub;
    if (claimsErr || !userId) {
      console.error("getClaims failed:", claimsErr?.message);
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // Optional: respect user_ai_access toggle if a row exists
    const { data: aiAccess } = await supabaseAuth
      .from("user_ai_access")
      .select("ai_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (aiAccess && aiAccess.ai_enabled === false) {
      return new Response(
        JSON.stringify({ error: "AI access disabled for this account" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Credit deduction (50 per request) ---
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: creditResult, error: creditErr } = await adminClient.rpc("consume_credits", {
      _user_id: userId,
      _amount: 25,
    });
    if (creditErr) {
      console.error("consume_credits error:", creditErr);
    } else if (creditResult && (creditResult as any).ok === false) {
      return new Response(
        JSON.stringify({
          error: `Kunlik credit limitingiz tugadi. Balans: ${(creditResult as any).balance}/${(creditResult as any).daily_limit}. Ertaga yangilanadi yoki planni yangilang.`,
          credits: creditResult,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { prompt, code, language, messages: chatHistory, mode } = await req.json();
    const isProjectMode = mode === "generate-project";

    const systemPrompt = isProjectMode
      ? BUILDFORGE_SYSTEM
      : CHAT_SYSTEM(language || "typescript", code || "");

    const allMessages = [
      { role: "system", content: systemPrompt },
      ...(chatHistory || []),
      ...(prompt ? [{ role: "user", content: prompt }] : []),
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Non-streaming for project generation
    if (isProjectMode) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: allMessages,
          temperature: 0.2,
          max_tokens: 16384,
          stream: false,
          tools: [PROJECT_FILES_TOOL],
          tool_choice: {
            type: "function",
            function: { name: "return_project_files" },
          },
        }),
      });

      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please wait and try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (resp.ok) {
        const data = await resp.json();
        const toolArguments = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;

        if (toolArguments) {
          try {
            const parsed = JSON.parse(toolArguments);
            const files = Array.isArray(parsed?.files) ? parsed.files : [];

            return new Response(
              JSON.stringify({ response: JSON.stringify(files), mode: "generate-project" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } catch (toolError) {
            console.error("Failed to parse tool arguments:", toolError);
          }
        }

        const text = data.choices?.[0]?.message?.content || "[]";
        return new Response(
          JSON.stringify({ response: text, mode: "generate-project" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to generate project" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Streaming for chat
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: allMessages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited. Please wait and try again." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "Credits exhausted." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (response.ok && response.body) {
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(
      JSON.stringify({ error: "AI service unavailable" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI Assistant error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
