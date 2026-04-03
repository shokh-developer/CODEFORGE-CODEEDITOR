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
      ? `You are "CodeForge AI", an advanced full-stack project generator similar to Lovable/Bolt.
When the user describes a project, generate ALL necessary files with complete, production-ready code.

IMPORTANT: Output ONLY valid JSON array, no markdown, no explanation. Each element:
{"name": "filename.ext", "path": "/", "language": "tsx", "content": "full file content here"}

RULES:
- Generate modern React + TypeScript + Tailwind CSS code
- Use functional components with hooks (useState, useEffect, useCallback, etc.)
- Use Tailwind CSS utility classes for all styling - no inline styles
- Create proper component structure: App.tsx as main entry, separate components
- Include index.html with React 18 CDN + Babel standalone for browser rendering
- Include Tailwind CDN in HTML
- Use modern patterns: arrow functions, destructuring, template literals
- Make responsive designs (mobile-first with sm:, md:, lg: breakpoints)
- Add proper TypeScript types and interfaces
- Include animations and transitions where appropriate
- Use semantic HTML elements
- Add hover effects, focus states, proper UX
- Generate COMPLETE working code - no placeholders, no "// TODO"
- Each file must have full, runnable content
- For multi-page apps, use simple state-based routing

FILE STRUCTURE for typical projects:
- index.html (entry point with React 18 + Babel + Tailwind CDN)
- App.tsx (main app component with routing/layout)
- components/Header.tsx, components/Footer.tsx, etc.
- styles.css (if custom CSS needed beyond Tailwind)

EXAMPLE index.html structure:
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body class="bg-gray-950 text-white font-[Inter]">
  <div id="root"></div>
  <script type="text/babel" data-presets="react,typescript">
    // Import and render App component inline or reference other files
    const App = () => { return <div>Hello</div> };
    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>`
      : `You are "CodeForge AI", a powerful coding assistant that writes code like a senior React/TypeScript developer.

Your code style:
- Modern React with TypeScript
- Tailwind CSS for styling (utility-first, no inline styles)
- Functional components with hooks
- Clean, readable, well-structured code
- Proper error handling
- Responsive design (mobile-first)
- Accessible (ARIA attributes, semantic HTML)
- Performance-optimized (useMemo, useCallback where needed)

Rules:
1. To create files: [CREATE_FILE: name.ext, /path/, language]
2. To create folders: [CREATE_FOLDER: name, /path/]
3. Wrap code in \`\`\`language blocks
4. Be concise and precise
5. Always provide complete, working code - no placeholders
6. Use TypeScript types/interfaces
7. Prefer Tailwind classes over custom CSS
8. Use modern ES6+ syntax
9. Add proper comments for complex logic

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

    const googleKeys = [
      Deno.env.get("GOOGLE_AI_KEY_1"),
      Deno.env.get("GOOGLE_AI_KEY_2"),
      Deno.env.get("GOOGLE_AI_KEY_3"),
      Deno.env.get("GEMINI_API_KEY"),
    ].filter(Boolean) as string[];

    for (let i = googleKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [googleKeys[i], googleKeys[j]] = [googleKeys[j], googleKeys[i]];
    }

    // Project generation (non-streaming)
    if (isProjectMode) {
      // Try Lovable AI first for better quality
      if (LOVABLE_API_KEY) {
        try {
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: allMessages,
              temperature: 0.3,
              max_tokens: 16384,
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
        } catch (e) { console.error("Lovable project gen error:", e); }
      }

      // Fallback to Google
      for (const key of googleKeys) {
        try {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 16384 },
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
          model: "google/gemini-2.5-flash",
          messages: allMessages,
          temperature: 0.7,
          max_tokens: 8192,
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

    // Fallback: Google keys non-streaming
    for (const key of googleKeys) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + (prompt || chatHistory?.[chatHistory.length - 1]?.content || "") }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
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
