import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert,
  Activity,
  DatabaseBackup,
  Lock,
  Send,
  Loader2,
  ArrowLeft,
  Trash2,
  Siren,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "forgeshield-log";

const PLAYBOOKS = [
  {
    id: "breach",
    icon: ShieldAlert,
    title: "Buzib kirilgan",
    desc: "Web-shell, backdoor, o'g'irlangan kalitlar — to'liq containment",
  },
  {
    id: "ddos",
    icon: Activity,
    title: "Sayt og'irlashdi / DDoS",
    desc: "L7 flood, trafik portlashi, DB overload — darhol yengillashtirish",
  },
  {
    id: "recover",
    icon: DatabaseBackup,
    title: "Ma'lumotni tiklash",
    desc: "Backup, point-in-time recovery, butunlikni tekshirish",
  },
  {
    id: "harden",
    icon: Lock,
    title: "Hardening",
    desc: "Hujumdan keyin tizimni qattiqlashtirish checklisti",
  },
] as const;

const SecurityOps = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();

  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Msg[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60)));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const run = async (payload: { text?: string; quick?: string }) => {
    if (busy) return;
    const userText = payload.text?.trim();
    const nextMessages: Msg[] = userText
      ? [...messages, { role: "user" as const, content: userText }]
      : messages;

    if (userText) {
      setMessages(nextMessages);
      setInput("");
    }
    setBusy(true);
    setMessages((prev) => [...(userText ? nextMessages : prev), { role: "assistant", content: "" }]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/security-ops`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
            quick: payload.quick,
          }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Xatolik: ${resp.status}`);
      }

      const contentType = resp.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const data = await resp.json();
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: data.response || "" };
          return copy;
        });
      } else {
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payloadStr = line.slice(6).trim();
            if (payloadStr === "[DONE]") continue;
            try {
              const json = JSON.parse(payloadStr);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                acc += delta;
                setMessages((prev) => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: "assistant", content: acc };
                  return copy;
                });
              }
            } catch {
              // partial chunk, ignore
            }
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Noma'lum xatolik";
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: `⚠️ ${message}` };
        return copy;
      });
      toast({ title: "ForgeShield", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || adminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <h1 className="font-orbitron text-xl text-foreground">Kirish taqiqlangan</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          ForgeShield Incident Response konsoli faqat administratorlar uchun ochiq.
        </p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Bosh sahifa
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10">
          <Siren className="h-4 w-4 text-destructive" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-orbitron text-sm font-bold text-foreground">ForgeShield · Incident Response</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            Buzib kirish, DDoS va tiklash bo'yicha 24/7 admin konsoli
          </p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            title="Jurnalni tozalash"
            onClick={() => setMessages([])}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6">
        {messages.length === 0 && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-orbitron text-base text-foreground">Vaziyatni tanlang yoki yozing</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Hodisani qanchalik batafsil tasvirlasangiz, reja shunchalik aniq bo'ladi: stack, hosting,
                belgilar, loglardagi qatorlar, oxirgi backup vaqti.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {PLAYBOOKS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => run({ quick: p.id })}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
                >
                  <p.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{p.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{p.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] break-words rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                    : "w-full max-w-full break-words rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground"
                }
              >
                {m.role === "assistant" && !m.content && busy ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Tahlil qilinmoqda…
                  </span>
                ) : m.role === "assistant" ? (
                  <div className="prose prose-sm prose-invert max-w-none break-words prose-pre:overflow-x-auto prose-pre:bg-muted prose-code:text-primary">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={endRef} />
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) run({ text: input });
              }
            }}
            placeholder="Hodisani tasvirlang: nima bo'ldi, qanday stack, qanday belgilar…"
            className="max-h-40 min-h-[52px] resize-none text-sm"
            disabled={busy}
          />
          <Button
            onClick={() => input.trim() && run({ text: input })}
            disabled={busy || !input.trim()}
            size="icon"
            className="h-[52px] w-[52px] shrink-0"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default SecurityOps;
