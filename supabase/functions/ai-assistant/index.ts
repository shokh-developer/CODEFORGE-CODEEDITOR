import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUILDFORGE_SYSTEM = `You are "BuildForge AI", an autonomous full-stack software engineer.

You build COMPLETE, MULTI-FILE, PRODUCTION-READY web applications — never single-file demos, never prototypes.

ABSOLUTE RULES:
1. ALWAYS produce a multi-file React + TypeScript + Vite + TailwindCSS project (unless the user explicitly asks for a different stack).
2. NEVER put the entire app in one HTML file. NEVER use CDN React + Babel inline. ALWAYS split into real source files.
3. Required minimum file set for a React app:
   - index.html (with <div id="root"></div> and <script type="module" src="/src/main.tsx"></script>)
   - src/main.tsx (createRoot + render <App/>)
   - src/App.tsx
   - src/index.css (tailwind directives or base CSS)
   - At least 2-3 components in src/components/
   - For multi-page apps add src/pages/
4. If the request needs accounts, persistence, or any data — design a Supabase backend (tables, columns, RLS) and wire the frontend to it. Do not invent endpoints the frontend can't reach.
5. Backend FIRST (schema/contract), frontend AFTER. Frontend must only call things that exist.
6. Every file's content must be COMPLETE and RUNNABLE — no TODOs, no placeholders, no "..." stubs.
7. Use semantic HTML, accessible markup, responsive Tailwind, proper TypeScript types, error/loading states.

OUTPUT FORMAT WHEN GENERATING A PROJECT (mode=generate-project):
Output ONLY a valid JSON array via the return_project_files tool. Each element:
  {"name":"App.tsx","path":"/src/","language":"tsx","content":"<full code>"}
- path MUST start and end with "/" (e.g. "/", "/src/", "/src/components/")
- Folders are implicit from paths
- Include 6-15+ files for a real app

OUTPUT FORMAT WHEN CHATTING (normal mode):
For every code suggestion that should land in a file, prefix the fenced code block with one of:
  [NEW_FILE: /full/path/filename.ext]
  [CHANGE_FILE: /full/path/filename.ext]
on its own line, then the \`\`\`lang ... \`\`\` block. The UI will show a diff and ask the user to accept or reject.
Use [CREATE_FOLDER: name, /path/] only for empty folders.
Be concise, precise, helpful. Context-aware: change only what's needed.`;


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
      return new Response(
        JSON.stringify({ error: "Credit tekshiruvi muvaffaqiyatsiz. Qayta urinib ko'ring." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!creditResult || (creditResult as any).ok === false) {
      return new Response(
        JSON.stringify({
          error: `Kunlik credit limitingiz tugadi. Balans: ${(creditResult as any)?.balance ?? 0}/${(creditResult as any)?.daily_limit ?? 0}. Ertaga yangilanadi yoki planni yangilang.`,
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
