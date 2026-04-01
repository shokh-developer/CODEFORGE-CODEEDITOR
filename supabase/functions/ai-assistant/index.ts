import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, code, language } = await req.json();

    const systemPrompt = `You are "CodeForge AI", a coding assistant similar to GitHub Copilot.
Always respond in English.

You can:
1. Write and explain code
2. Find and fix bugs
3. Create new files (format: [CREATE_FILE: file_name, path, language])
4. Create new folders (format: [CREATE_FOLDER: folder_name, path])
5. Optimize code
6. Write tests
7. Generate documentation

Special command format:
- Create file: [CREATE_FILE: file_name.ext, /path/, language]
- Create folder: [CREATE_FOLDER: folder_name, /path/]

If you provide code, wrap it in \`\`\`language ... \`\`\`.
Keep responses concise, clear, and useful.

Current code context:
\`\`\`${language}
${code || "// No code yet"}
\`\`\``;

    // Try with rotating Google keys first
    const googleKeys = [
      Deno.env.get("GOOGLE_AI_KEY_1"),
      Deno.env.get("GOOGLE_AI_KEY_2"),
      Deno.env.get("GOOGLE_AI_KEY_3"),
      Deno.env.get("GEMINI_API_KEY"),
    ].filter(Boolean) as string[];

    // Shuffle keys for rotation
    for (let i = googleKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [googleKeys[i], googleKeys[j]] = [googleKeys[j], googleKeys[i]];
    }

    // Try each Google key
    for (const key of googleKeys) {
      try {
        const googleResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                { role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }
              ],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096,
              },
            }),
          }
        );

        if (googleResponse.ok) {
          const data = await googleResponse.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Failed to get response";
          return new Response(JSON.stringify({ response: text }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        console.error(`Google key failed: ${googleResponse.status}`);
      } catch (e) {
        console.error("Google key error:", e instanceof Error ? e.message : "Unknown error");
      }
    }

    // Fallback to Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      console.log("Falling back to Lovable AI Gateway");

      const models = [
        "google/gemini-2.5-flash",
        "google/gemini-2.5-flash-lite",
        "google/gemini-3-flash-preview",
      ];

      for (const model of models) {
        try {
          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
              ],
              temperature: 0.7,
              max_tokens: 4096,
              stream: false,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const assistantResponse = data.choices?.[0]?.message?.content || "Failed to get response";
            return new Response(JSON.stringify({ response: assistantResponse }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          console.error(`Lovable AI model ${model} failed: ${response.status}`);
          if (response.status !== 429 && response.status !== 402) {
            break;
          }
        } catch (e) {
          console.error(`Lovable AI model ${model} error:`, e);
        }
      }
    }

    if (googleKeys.length === 0 && !LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI is not configured. Add API keys." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "All AI providers are currently busy. Please try again." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI Assistant error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
