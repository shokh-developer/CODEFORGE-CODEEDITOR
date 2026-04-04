import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUILDFORGE_SYSTEM = `You are "BuildForge AI", an advanced full-stack project builder.

You build COMPLETE, PRODUCTION-READY applications — not snippets.

TECH STACK:
- React 18 + TypeScript
- TailwindCSS (utility-first, responsive)
- Vite for bundling
- Functional components with hooks

CODE QUALITY:
- Production-level, clean architecture
- Split into multiple components
- Proper TypeScript types/interfaces
- No placeholders, no TODOs, no fake data
- Error handling, loading states
- Responsive design (mobile-first)
- Semantic HTML + accessibility
- Modern ES6+ patterns

WHEN GENERATING A PROJECT (mode=generate-project):
Output ONLY a valid JSON array. No markdown, no explanation.
Each element: {"name":"file.ext","path":"/path/","language":"tsx","content":"full code"}

Required files:
- index.html (entry with React 18 CDN + Babel + Tailwind CDN)
- App.tsx (main component with layout/routing)
- Multiple component files (Header, Footer, etc.)
- styles.css if needed

index.html MUST use:
- <script src="https://cdn.tailwindcss.com"></script>
- <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
- <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
- <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
- All component code inline in a single <script type="text/babel"> tag
- Complete, working, rendered UI

WHEN CHATTING (normal mode):
- Write complete, working code
- Use [CREATE_FILE: name, /path/, language] for new files
- Use [CREATE_FOLDER: name, /path/] for folders
- Wrap code in \`\`\`language blocks
- Be concise, precise, helpful
- Context-aware: update only what's needed`;

const CHAT_SYSTEM = (language: string, code: string) =>
  `${BUILDFORGE_SYSTEM}

Current file language: ${language}
\`\`\`${language}
${code || "// Empty file"}
\`\`\``;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
          model: "google/gemini-2.5-flash",
          messages: allMessages,
          temperature: 0.3,
          max_tokens: 16384,
          stream: false,
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
        max_tokens: 8192,
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
