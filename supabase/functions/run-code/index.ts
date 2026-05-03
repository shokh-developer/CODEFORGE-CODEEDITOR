import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Cache the compiler list
let cachedCompilers: Array<{ name: string; language: string }> | null = null;
let cacheTime = 0;

async function getCompilerList(): Promise<Array<{ name: string; language: string }>> {
  if (cachedCompilers && Date.now() - cacheTime < 3600000) return cachedCompilers;
  try {
    const res = await fetch("https://wandbox.org/api/list.json");
    if (res.ok) {
      cachedCompilers = await res.json();
      cacheTime = Date.now();
      return cachedCompilers!;
    }
  } catch (e) {
    console.error("Failed to fetch compiler list:", e);
  }
  return [];
}

function findCompiler(compilers: Array<{ name: string; language: string }>, language: string): string | null {
  // Map our language names to Wandbox language names
  const langMap: Record<string, string> = {
    python: "Python",
    javascript: "JavaScript",
    typescript: "TypeScript",
    cpp: "C++",
    c: "C",
    java: "Java",
    go: "Go",
    rust: "Rust",
    php: "PHP",
    ruby: "Ruby",
    csharp: "C#",
    lua: "Lua",
    perl: "Perl",
    bash: "Bash script",
    scala: "Scala",
    r: "R",
    swift: "Swift",
    kotlin: "Kotlin",
  };

  const wandboxLang = langMap[language];
  if (!wandboxLang) return null;

  // Find matching compilers
  const matching = compilers.filter(c => c.language === wandboxLang);
  if (matching.length === 0) return null;

  // Prefer non-head versions, then head
  const nonHead = matching.filter(c => !c.name.includes("head"));
  if (nonHead.length > 0) return nonHead[nonHead.length - 1].name; // Latest non-head
  return matching[0].name; // head version
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
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
    const { data: userRes, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { code, language, stdin } = await req.json();

    if (!code || !language) {
      return new Response(
        JSON.stringify({ error: "Code and language are required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Executing ${language} code`);

    // Get compiler list
    const compilers = await getCompilerList();
    console.log(`Got ${compilers.length} compilers from Wandbox`);

    const compiler = findCompiler(compilers, language);
    
    if (!compiler) {
      return new Response(
        JSON.stringify({ error: `No compiler found for ${language}`, success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Using compiler: ${compiler}`);

    const res = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        compiler,
        stdin: stdin || "",
        save: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Compiler ${compiler} failed:`, errText);
      
      // Try head version as fallback
      const headCompiler = findHeadCompiler(compilers, language);
      if (headCompiler && headCompiler !== compiler) {
        console.log(`Trying head compiler: ${headCompiler}`);
        return await tryCompiler(headCompiler, code, stdin, language);
      }
      
      return new Response(
        JSON.stringify({ error: "Execution failed", details: errText, success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await res.json();
    
    // Check for infra errors
    if (data.program_error?.includes("catatonit") || data.program_error?.includes("No such file or directory")) {
      console.log("Infrastructure error, trying head compiler...");
      const headCompiler = findHeadCompiler(compilers, language);
      if (headCompiler && headCompiler !== compiler) {
        return await tryCompiler(headCompiler, code, stdin, language);
      }
    }

    return new Response(
      JSON.stringify(formatResult(data, language, compiler)),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function findHeadCompiler(compilers: Array<{ name: string; language: string }>, language: string): string | null {
  const langMap: Record<string, string> = {
    python: "Python", javascript: "JavaScript", typescript: "TypeScript",
    cpp: "C++", c: "C", java: "Java", go: "Go", rust: "Rust",
    php: "PHP", ruby: "Ruby", csharp: "C#", lua: "Lua", perl: "Perl",
    bash: "Bash script", scala: "Scala", r: "R", swift: "Swift", kotlin: "Kotlin",
  };
  const wandboxLang = langMap[language];
  if (!wandboxLang) return null;
  const head = compilers.find(c => c.language === wandboxLang && c.name.includes("head"));
  return head?.name || null;
}

async function tryCompiler(compiler: string, code: string, stdin: string, language: string) {
  try {
    const res = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, compiler, stdin: stdin || "", save: false }),
    });
    
    if (!res.ok) {
      const errText = await res.text();
      return new Response(
        JSON.stringify({ error: "Execution failed", details: errText, success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await res.json();
    return new Response(
      JSON.stringify(formatResult(data, language, compiler)),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Compiler failed", success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

function formatResult(data: any, language: string, compiler: string) {
  return {
    success: true,
    language,
    version: compiler,
    compile: data.compiler_error ? {
      stdout: data.compiler_output || "",
      stderr: data.compiler_error,
      code: 1,
    } : (data.compiler_output ? {
      stdout: data.compiler_output,
      stderr: "",
      code: 0,
    } : null),
    run: {
      stdout: data.program_output || "",
      stderr: data.program_error || "",
      code: data.status === "0" || data.status === 0 ? 0 : (parseInt(String(data.status)) || 0),
      signal: data.signal || "",
    },
  };
}
