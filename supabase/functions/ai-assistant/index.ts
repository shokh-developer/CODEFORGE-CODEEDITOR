import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, code, language, messages: chatHistory, mode } = await req.json();

    const isProjectMode = mode === "generate-project";

    const systemPrompt = isProjectMode
      ? `You are "CodeForge AI", an advanced project generator. 
When the user describes a project, generate ALL necessary files with their full content.

IMPORTANT: Output ONLY valid JSON array, no markdown, no explanation. Each element:
{"name": "filename.ext", "path": "/", "language": "html", "content": "full file content here"}

Rules:
- Generate complete, working code - no placeholders
- Include index.html as entry point
- Use modern CSS (Tailwind CDN or custom)  
- Add proper meta tags, responsive design
- For multi-file projects: HTML, CSS, JS files separately
- Always include complete content for each file
- Language field should match: html, css, javascript, typescript, python, etc.`
      : `You are "CodeForge AI", a powerful coding assistant.
You help users write, debug, optimize, and understand code.

Rules:
1. To create files: [CREATE_FILE: name.ext, /path/, language]
2. To create folders: [CREATE_FOLDER: name, /path/]  
3. Wrap code in \`\`\`language blocks
4. Be concise and precise
5. Always provide working, complete code

Current file: ${language}
\`\`\`${language}
${code || "// No code yet"}
\`\`\``;

    const allMessages = [
      { role: "system", content: systemPrompt },
      ...(chatHistory || []),
      ...(prompt ? [{ role: "user", content: prompt }] : []),
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    // Try Google keys first for non-streaming
    const googleKeys = [
      Deno.env.get("GOOGLE_AI_KEY_1"),
      Deno.env.get("GOOGLE_AI_KEY_2"),
      Deno.env.get("GOOGLE_AI_KEY_3"),
      Deno.env.get("GEMINI_API_KEY"),
    ].filter(Boolean) as string[];

    // Shuffle
    for (let i = googleKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [googleKeys[i], googleKeys[j]] = [googleKeys[j], googleKeys[i]];
    }

    // For project generation, use non-streaming for reliable JSON
    if (isProjectMode) {
      // Try Google first
      for (const key of googleKeys) {
        try {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
              }),
            }
          );
          if (resp.ok) {
            const data = await resp.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
            return new Response(JSON.stringify({ response: text, mode: "generate-project" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (e) { console.error("Google project gen error:", e); }
      }

      // Fallback to Lovable AI
      if (LOVABLE_API_KEY) {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: allMessages,
            temperature: 0.3,
            max_tokens: 8192,
            stream: false,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const text = data.choices?.[0]?.message?.content || "[]";
          return new Response(JSON.stringify({ response: text, mode: "generate-project" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ error: "Failed to generate project" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STREAMING mode for chat
    if (LOVABLE_API_KEY) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: allMessages,
          temperature: 0.7,
          max_tokens: 4096,
          stream: true,
        }),
      });

      if (response.ok && response.body) {
        return new Response(response.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

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
    }

    // Fallback: try Google keys non-streaming
    for (const key of googleKeys) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + (prompt || chatHistory?.[chatHistory.length - 1]?.content || "") }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
            }),
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
          return new Response(JSON.stringify({ response: text }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (e) { console.error("Google fallback error:", e); }
    }

    return new Response(JSON.stringify({ error: "All AI providers failed. Try again later." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("AI Assistant error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
