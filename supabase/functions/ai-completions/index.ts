import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Try Google Gemini with rotating keys, fallback to Lovable AI
async function callAI(systemPrompt: string, userPrompt: string, temperature: number, maxTokens: number): Promise<string> {
  const googleKeys = [
    Deno.env.get("GOOGLE_AI_KEY_1"),
    Deno.env.get("GOOGLE_AI_KEY_2"),
    Deno.env.get("GOOGLE_AI_KEY_3"),
  ].filter(Boolean) as string[];

  // Shuffle for rotation
  for (let i = googleKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [googleKeys[i], googleKeys[j]] = [googleKeys[j], googleKeys[i]];
  }

  // Try Google keys
  for (const key of googleKeys) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
            generationConfig: { temperature, maxOutputTokens: maxTokens },
          }),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
      console.error(`Google key failed: ${resp.status}`);
    } catch (e) {
      console.error("Google key error:", e);
    }
  }

  // Fallback to Lovable AI - try multiple models
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("No AI keys available");

  const models = [
    "google/gemini-2.5-flash",
    "google/gemini-2.5-flash-lite",
    "google/gemini-3-flash-preview",
  ];

  for (const model of models) {
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature,
          max_tokens: maxTokens,
          stream: false,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        return data.choices?.[0]?.message?.content || "";
      }
      console.error(`Lovable AI model ${model} failed: ${resp.status}`);
      // If rate limited, try next model
      if (resp.status === 429 || resp.status === 402) continue;
      // For other errors, also try next
    } catch (e) {
      console.error(`Lovable AI model ${model} error:`, e);
    }
  }

  throw new Error("RATE_LIMIT");
}

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
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
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

    const { code, language, cursorPosition, projectContext, type } = await req.json();

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "inline") {
      systemPrompt = `Sen GitHub Copilot kabi kod yordamchisisan. Foydalanuvchi yozayotgan kodni davom ettir.

Qoidalar:
1. FAQAT kod yoz, tushuntirma yoki markdown ishlatma
2. Kod logikasini to'g'ri davom ettir
3. Iloji boricha qisqa lekin to'liq javob ber
4. Hozirgi kontekstni hisobga ol
5. Sintaksis xatosiz kod yoz`;

      userPrompt = `Til: ${language}
Cursor pozitsiyasi: ${cursorPosition.line}:${cursorPosition.column}

Kod:
${code}

Kodning davomini yoz (FAQAT kod, hech qanday tushuntirma yoki markdown emas):`;
    } else if (type === "explain") {
      systemPrompt = `Sen tajribali dasturchi va o'qituvchisan. Kodni tushunarli qilib tushuntir. O'zbek tilida javob ber.`;
      userPrompt = `Bu ${language} kodini tushuntir:\n\`\`\`${language}\n${code}\n\`\`\``;
    } else if (type === "fix") {
      systemPrompt = `Sen tajribali dasturchi va debuggersan. Koddagi xatolarni top va to'g'irla. O'zbek tilida javob ber.`;
      userPrompt = `Bu ${language} kodida xato bor. Xatoni top va to'g'rilangan kodni qaytaring:\n\`\`\`${language}\n${code}\n\`\`\``;
    } else if (type === "tests") {
      systemPrompt = `Sen test yozish bo'yicha mutaxassisan. Kod uchun unit testlar yoz.`;
      userPrompt = `Bu ${language} kod uchun unit testlar yoz:\n\`\`\`${language}\n${code}\n\`\`\``;
    } else if (type === "refactor") {
      systemPrompt = `Sen kod sifati bo'yicha mutaxassisan. Kodni yaxshila va optimizatsiya qil.`;
      userPrompt = `Bu ${language} kodni refaktor qil va yaxshila:\n\`\`\`${language}\n${code}\n\`\`\``;
    } else if (type === "docs") {
      systemPrompt = `Sen texnik yozuvchi san. Kod uchun dokumentatsiya yoz.`;
      userPrompt = `Bu ${language} kod uchun JSDoc/docstring yoz:\n\`\`\`${language}\n${code}\n\`\`\``;
    }

    if (projectContext && projectContext.files) {
      systemPrompt += `\n\nLoyiha konteksti:\n${projectContext.files.map((f: any) => `- ${f.path}${f.name}`).join("\n")}`;
    }

    const temp = type === "inline" ? 0.3 : 0.7;
    const tokens = type === "inline" ? 256 : 2048;

    const completion = await callAI(systemPrompt, userPrompt, temp, tokens);

    let result = completion;
    if (type === "inline") {
      result = result.replace(/```[\w]*\n?/g, "").replace(/```/g, "").trim();
    }

    return new Response(JSON.stringify({ completion: result, type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("AI Completions error:", error);
    
    if (error.message === "RATE_LIMIT") {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Biroz kuting va qayta urinib ko'ring." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (error.message === "PAYMENT_REQUIRED") {
      return new Response(
        JSON.stringify({ error: "AI xizmati hozir band. Biroz kuting va qayta urinib ko'ring." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
