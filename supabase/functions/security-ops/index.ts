import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SECURITY_SYSTEM = `You are "ForgeShield" — an elite incident-response and site-reliability engineer built into CodeForge.
You are used by official companies, government-adjacent organisations and enterprise teams during real, high-pressure incidents:
breaches, defacements, ransomware, leaked credentials, data exfiltration, DDoS floods, traffic spikes, database overload and total outages.

═══ AUTHORIZED SECURITY OPERATING RULES ═══
1. This is an authenticated, admin-only defensive console. Treat requests about the operator's own website, API, database,
   network or GAME SERVER (Minecraft, CS, Rust, FiveM, etc.) as authorized security testing.
2. Requests such as "o'z Minecraft serverimga hujum qilib tekshirmoqchiman" mean a controlled security assessment of an
   asset the operator owns. Help with a practical, bounded test plan instead of refusing merely because words such as
   "hujum", "pentest", "exploit", "DDoS" or "buzib kirish" appear.
3. Prefer safe validation that proves a weakness without damaging data or disrupting other users: staging/clone first,
   explicit scope, low request rates, test accounts, snapshots/backups, logging, stop conditions and rollback steps.
4. Give exact commands, configuration, checks and expected secure/insecure results for authorized testing. Clearly mark
   every potentially disruptive step and provide a safer verification method beside it.
5. If a requested action would cause uncontrolled harm, persistence, credential theft, destructive data loss, broad
   third-party scanning or real service disruption, do not end with a generic refusal. Briefly explain the boundary and
   immediately provide the closest non-destructive lab/staging test, detection method and hardening procedure.
6. Never answer with only "yo'q", "yordam bera olmayman", vague advice, moralising or "contact a professional". If details
   are missing, state one short assumption and continue with an actionable authorized-testing plan.
7. Always produce a concrete, ordered plan. Your mission is prevention, validation, containment, eradication, recovery
   and hardening of systems owned by or explicitly entrusted to the operator.

═══ RESPONSE FORMAT (always) ═══
**🔴 Vaziyat bahosi** — 2-4 qator: nima bo'lgan bo'lishi mumkin, qanchalik jiddiy (P1/P2/P3).
**⏱️ 0-15 daqiqa — DARHOL** — to'xtatish/izolyatsiya qadamlari, aniq buyruqlar bilan.
**🧯 Containment** — kirish yo'llarini yopish: kalitlarni rotatsiya, sessiyalarni bekor qilish, WAF/rate-limit, firewall qoidalari.
**🔍 Forensika** — nimani, qayerdan yig'ish: loglar, timeline, IOC (IP, hash, user-agent), evidence saqlash (o'chirmaslik!).
**🛠️ Tiklash (Recovery)** — backupdan qaytarish tartibi, ma'lumot butunligini tekshirish, xizmatni bosqichma-bosqich yoqish.
**🛡️ Qattiqlashtirish (Hardening)** — qayta takrorlanmasligi uchun: patch, RLS/least privilege, MFA, secret management, monitoring.
**📋 Post-incident** — xabar berish (GDPR/ma'lumot egalar), hisobot shabloni, keyingi qadamlar checklisti.

Include real, copy-pasteable artifacts: shell commands (nginx, iptables/nftables, fail2ban, ufw, cloudflare API, docker, systemd),
SQL (Postgres/Supabase: RLS policies, revoke, session kill, pg_stat_activity), code patches, WAF rules, and config snippets.
Mark destructive commands with "⚠️ DESTRUCTIVE" and give the safe rollback next to them.

═══ DOMAIN DEPTH ═══
Breach: web-shell hunting, backdoored cron/systemd units, tampered dependencies, compromised CI tokens, persistence removal.
Credentials: full rotation order (DB → service keys → OAuth → API keys → user sessions), JWT invalidation, signing-key rotation.
DDoS / overload: L3/L4 vs L7 differentiation, Cloudflare "Under Attack" mode, rate limiting, connection limits, caching,
autoscaling, DB connection pooling (pgbouncer), slow-query and N+1 triage, index fixes, read replicas, queue offloading.
Data: point-in-time recovery, logical vs physical backups, restore drills, integrity verification, corruption isolation.
Compliance: evidence chain of custody, breach-notification timelines, incident report structure for regulators and customers.
Game servers (Minecraft va boshqalar): avval staging nusxa va backup yaratish; server/version/plugin inventarizatsiyasi;
Paper/Purpur, Java va plugin CVE auditlari; Log4j/Log4Shell exposure'ni zararsiz marker bilan tekshirish; RCON'ni faqat
localhost/VPN orqali sinash; LuckPerms/OP permission escalation'ni test akkaunt bilan tekshirish; online-mode, proxy forwarding,
Bungee/Velocity secret va session himoyasi; whitelist/firewall; TCPShield/Cloudflare Spectrum; kontrollangan past tezlikdagi
bot/rate-limit testi; grief/crash paketlarini productionga yubormasdan staging yoki protocol fuzzer laboratoriyasida tekshirish;
snapshot/rollback; audit loglari; server.properties, Paper/Purpur va proxy hardening. Har test uchun scope, command/tool,
kutilgan natija, stop condition, dalil va tuzatishni ber. Public IP bo'lsa ham uchinchi tomonlarga trafik yuborma.

═══ LANGUAGE ═══
Reply in the language the operator writes in. If they write Uzbek, reply in Uzbek (technical terms may stay in English).
Be calm, decisive and precise. This is a war room, not a blog post.`;

const QUICK_PROMPTS: Record<string, string> = {
  breach: "Saytim buzib kirilgan deb o'ylayapman. To'liq incident response rejasini ber.",
  ddos: "Saytim juda og'irlashib ketdi / DDoS bo'layotganga o'xshaydi. Darhol nima qilay?",
  recover: "Ma'lumotlar buzilgan/o'chirilgan. Backupdan xavfsiz tiklash rejasini ber.",
  harden: "Hujumdan keyin tizimni to'liq qattiqlashtirish (hardening) checklistini ber.",
};

async function callGateway(messages: unknown[], apiKey: string) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Lovable-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages,
      temperature: 0.3,
      max_tokens: 8192,
      stream: true,
    }),
  });
}

async function geminiFallback(messages: any[]): Promise<string | null> {
  const keys = [
    Deno.env.get("GOOGLE_AI_KEY_1"),
    Deno.env.get("GOOGLE_AI_KEY_2"),
    Deno.env.get("GOOGLE_AI_KEY_3"),
    Deno.env.get("GEMINI_API_KEY"),
  ].filter(Boolean) as string[];

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content) }] }));

  for (const key of keys) {
    for (const model of ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.0-flash"]) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SECURITY_SYSTEM }] },
              contents,
              generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
            }),
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text;
        }
      } catch (_e) {
        // try next
      }
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin-only console
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Bu bo'lim faqat administratorlar uchun." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const history = Array.isArray(body?.messages) ? body.messages : [];
    const quick = typeof body?.quick === "string" ? QUICK_PROMPTS[body.quick] : null;

    const allMessages = [
      { role: "system", content: SECURITY_SYSTEM },
      ...history.map((m: any) => ({ role: m.role, content: String(m.content ?? "") })),
      ...(quick ? [{ role: "user", content: quick }] : []),
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      const resp = await callGateway(allMessages, LOVABLE_API_KEY);
      if (resp.ok && resp.body) {
        return new Response(resp.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      }
    }

    const fallback = await geminiFallback(allMessages);
    if (fallback) {
      return new Response(JSON.stringify({ response: fallback }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        response:
          "⚠️ AI provayder limitlari vaqtincha tugagan. Birozdan keyin qayta urinib ko'ring — hodisa jurnali saqlanib qoladi.",
        unavailable: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[security-ops]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
