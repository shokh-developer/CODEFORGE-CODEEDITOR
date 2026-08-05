import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Braces, RotateCcw, Keyboard, AlignLeft, Type } from "lucide-react";

const WORDS = `the be of and a to in he have it that for they with as not on she at by this we you do but from or which one would all will there say who make when can more if no man out other so what time up go about than into could state only new year some take come these know see use get like then first any work now may such give over think most even find day also after way many must look before great back through long where much should well people down own just because good each those feel seem how high too place little world very still nation hand old life tell write become here show house both between need mean call develop under last right move thing general school never same another begin while number part turn real leave might want point form off child few small since against ask late home interest large person end open public follow during present without again hold govern around possible head consider word program problem however lead system set order eye plan run keep face fact group play stand increase early course change help line`
  .split(/\s+/)
  .filter(Boolean);

const MODES = [15, 30, 60, 120] as const;
const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

const randomWords = (count: number) =>
  Array.from({ length: count }, () => WORDS[Math.floor(Math.random() * WORDS.length)]);

type Status = "correct" | "incorrect" | "pending" | "extra";

const ForgeTyping = () => {
  const navigate = useNavigate();
  const [duration, setDuration] = useState<number>(30);
  const [tapeMode, setTapeMode] = useState(false);
  const [showKeymap, setShowKeymap] = useState(true);
  const [words, setWords] = useState<string[]>(() => randomWords(160));
  const [typed, setTyped] = useState<string[]>([""]);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [rawKeystrokes, setRawKeystrokes] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const wordIndex = typed.length - 1;

  const reset = useCallback(
    (next = duration) => {
      setWords(randomWords(160));
      setTyped([""]);
      setStarted(false);
      setFinished(false);
      setTimeLeft(next);
      setRawKeystrokes(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [duration],
  );

  useEffect(() => {
    if (!started || finished) return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setFinished(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [started, finished]);

  // Keep caret in view (tape mode scrolls horizontally, normal scrolls vertically)
  useEffect(() => {
    const caret = caretRef.current;
    const scroller = scrollerRef.current;
    if (!caret || !scroller) return;
    if (tapeMode) {
      const offset = caret.offsetLeft - scroller.clientWidth * 0.32;
      scroller.scrollTo({ left: Math.max(0, offset), behavior: "smooth" });
    } else {
      const offset = caret.offsetTop - scroller.clientHeight / 2 + caret.offsetHeight;
      scroller.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
    }
  }, [typed, tapeMode]);

  const stats = useMemo(() => {
    let correctChars = 0;
    let incorrectChars = 0;
    typed.forEach((entry, i) => {
      const target = words[i] ?? "";
      for (let c = 0; c < entry.length; c += 1) {
        if (entry[c] === target[c]) correctChars += 1;
        else incorrectChars += 1;
      }
      if (i < typed.length - 1 && entry === target) correctChars += 1; // space
    });
    const elapsed = Math.max(1, duration - timeLeft);
    const minutes = elapsed / 60;
    const wpm = Math.round(correctChars / 5 / minutes);
    const raw = Math.round(rawKeystrokes / 5 / minutes);
    const total = correctChars + incorrectChars;
    const accuracy = total ? Math.round((correctChars / total) * 100) : 100;
    return { wpm: Number.isFinite(wpm) ? wpm : 0, raw: Number.isFinite(raw) ? raw : 0, accuracy, incorrectChars };
  }, [typed, words, duration, timeLeft, rawKeystrokes]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (finished) {
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        reset();
      }
      return;
    }

    const { key } = event;
    if (key === "Tab") {
      event.preventDefault();
      reset();
      return;
    }
    if (key.length === 1 || key === "Backspace") {
      setActiveKey(key === " " ? "space" : key.toLowerCase());
      window.setTimeout(() => setActiveKey(null), 110);
    }

    if (key === " ") {
      event.preventDefault();
      if (!typed[wordIndex]) return;
      setStarted(true);
      setRawKeystrokes((n) => n + 1);
      setTyped((prev) => [...prev, ""]);
      return;
    }

    if (key === "Backspace") {
      event.preventDefault();
      setTyped((prev) => {
        const next = [...prev];
        if (next[next.length - 1].length === 0) {
          if (next.length === 1) return next;
          next.pop();
        } else {
          next[next.length - 1] = next[next.length - 1].slice(0, -1);
        }
        return next;
      });
      return;
    }

    if (key.length === 1) {
      event.preventDefault();
      setStarted(true);
      setRawKeystrokes((n) => n + 1);
      setTyped((prev) => {
        const next = [...prev];
        const target = words[next.length - 1] ?? "";
        if (next[next.length - 1].length >= target.length + 8) return next;
        next[next.length - 1] += key;
        return next;
      });
    }
  };

  const charStatus = (wordPos: number, char: string, index: number, target: string): Status => {
    const entry = typed[wordPos];
    if (entry === undefined || index >= entry.length) return "pending";
    if (index >= target.length) return "extra";
    return entry[index] === char ? "correct" : "incorrect";
  };

  const statusClass: Record<Status, string> = {
    correct: "text-foreground",
    incorrect: "text-destructive underline decoration-destructive/60",
    pending: "text-muted-foreground/45",
    extra: "text-destructive/70",
  };

  const visibleWords = tapeMode ? words.slice(0, wordIndex + 60) : words.slice(0, 120);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <nav className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-6 h-[52px] flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-sm">
            <Braces className="h-4 w-4 text-primary" />
            <span className="font-orbitron text-[12px] tracking-tight">ForgeTyping</span>
          </button>
          <span className="text-[11px] text-muted-foreground">tab + enter — restart</span>
        </div>
      </nav>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 flex flex-col gap-8">
        {/* Config bar */}
        <div className="flex flex-wrap items-center justify-center gap-1 rounded-lg bg-muted/25 px-3 py-2 text-[12px]">
          <button
            onClick={() => setTapeMode((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${tapeMode ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <AlignLeft className="h-3.5 w-3.5" /> tape
          </button>
          <button
            onClick={() => setShowKeymap((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${showKeymap ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Keyboard className="h-3.5 w-3.5" /> keymap
          </button>
          <span className="mx-2 h-4 w-px bg-border" />
          <Type className="h-3.5 w-3.5 text-muted-foreground" />
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => {
                setDuration(m);
                reset(m);
              }}
              className={`px-3 py-1 rounded transition-colors ${duration === m ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {m}
            </button>
          ))}
        </div>

        {finished ? (
          <div className="flex flex-col items-center gap-8 py-12">
            <div className="flex gap-12">
              <div>
                <div className="text-xs text-muted-foreground">wpm</div>
                <div className="font-orbitron text-6xl text-primary">{stats.wpm}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">acc</div>
                <div className="font-orbitron text-6xl text-primary">{stats.accuracy}%</div>
              </div>
            </div>
            <div className="flex gap-8 text-sm text-muted-foreground">
              <span>raw {stats.raw}</span>
              <span>errors {stats.incorrectChars}</span>
              <span>time {duration}s</span>
            </div>
            <button
              onClick={() => reset()}
              className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted/40 transition-colors"
            >
              <RotateCcw className="h-4 w-4" /> restart
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between font-orbitron text-primary text-2xl">
              <span>{timeLeft}</span>
              <span className="text-base text-muted-foreground">
                {stats.wpm} wpm · {stats.accuracy}%
              </span>
            </div>

            <div
              className="relative cursor-text"
              onClick={() => inputRef.current?.focus()}
            >
              <input
                ref={inputRef}
                autoFocus
                value=""
                onChange={() => undefined}
                onKeyDown={handleKeyDown}
                className="absolute opacity-0 h-0 w-0"
                aria-label="typing input"
              />
              <div
                ref={scrollerRef}
                className={
                  tapeMode
                    ? "overflow-x-hidden whitespace-nowrap py-6"
                    : "overflow-y-hidden h-[132px] py-1"
                }
              >
                <div className={tapeMode ? "inline-flex gap-3" : "flex flex-wrap gap-x-3 gap-y-2"}>
                  {visibleWords.map((word, wi) => {
                    const entry = typed[wi] ?? "";
                    const chars = word.split("");
                    const extras = entry.slice(word.length).split("");
                    return (
                      <span key={`${word}-${wi}`} className="font-jetbrains text-[22px] leading-[1.8]">
                        {chars.map((char, ci) => {
                          const isCaret = wi === wordIndex && ci === entry.length;
                          return (
                            <span key={ci} className="relative">
                              {isCaret && (
                                <span
                                  ref={caretRef}
                                  className="absolute -left-[2px] top-[0.18em] h-[1.1em] w-[2px] bg-primary animate-pulse"
                                />
                              )}
                              <span className={statusClass[charStatus(wi, char, ci, word)]}>{char}</span>
                            </span>
                          );
                        })}
                        {extras.map((char, ci) => (
                          <span key={`x${ci}`} className={statusClass.extra}>
                            {char}
                          </span>
                        ))}
                        {wi === wordIndex && entry.length >= word.length && (
                          <span ref={caretRef} className="inline-block h-[1.1em] w-[2px] align-middle bg-primary animate-pulse" />
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {showKeymap && (
              <div className="flex flex-col items-center gap-1.5 pt-4">
                {KEY_ROWS.map((row, ri) => (
                  <div key={ri} className="flex gap-1.5" style={{ paddingLeft: ri * 14 }}>
                    {row.split("").map((key) => (
                      <span
                        key={key}
                        className={`h-2.5 w-2.5 rounded-full transition-colors duration-100 ${
                          activeKey === key ? "bg-primary" : "bg-muted-foreground/25"
                        }`}
                      />
                    ))}
                  </div>
                ))}
                <span
                  className={`mt-1 h-2.5 w-24 rounded-full transition-colors duration-100 ${
                    activeKey === "space" ? "bg-primary" : "bg-muted-foreground/25"
                  }`}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default ForgeTyping;
