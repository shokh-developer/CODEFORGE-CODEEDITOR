import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import SpaceBackground from "@/components/SpaceBackground";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import CreditBadge from "@/components/CreditBadge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createRoom } from "@/hooks/useFiles";
import { useAuth } from "@/hooks/useAuth";
import AuthModal from "@/components/AuthModal";
import {
  Code, Users, ArrowRight, Plus, LogIn, Terminal,
  User, LogOut, Settings, Layers, Zap, Braces,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Single source of truth for all supported languages
const LANGUAGES = [
  "JavaScript", "TypeScript", "JSX", "TSX",
  "HTML", "CSS", "SCSS", "JSON",
  "Python", "Java", "C", "C++", "C#",
  "Go", "Rust", "PHP", "Ruby", "Swift", "Kotlin",
  "SQL", "Bash/Shell", "YAML", "Markdown", "XML", "Dart",
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.055, delayChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.23, 1, 0.32, 1] as const } },
};

const Index = () => {
  const [roomName, setRoomName]     = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const navigate    = useNavigate();
  const { toast }   = useToast();
  const { user, profile, isAuthenticated, signOut, loading } = useAuth();

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      toast({ title: "Room name required", description: "Please enter a room name", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    try {
      const room = await createRoom(roomName);
      if (room?.id) navigate(`/room/${room.id}`);
      else throw new Error("Room was not created");
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "An error occurred", variant: "destructive" });
    } finally { setIsCreating(false); }
  };

  const handleJoinRoom = () => {
    if (!joinRoomId.trim()) {
      toast({ title: "Room ID required", description: "Please enter a room ID", variant: "destructive" });
      return;
    }
    let roomId = joinRoomId.trim();
    if (roomId.includes("/room/")) roomId = roomId.split("/room/").pop() || roomId;
    navigate(`/room/${roomId}`);
  };

  const handleSignOut = async () => { await signOut(); toast({ title: "Signed out" }); };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const features = [
    { icon: Layers,   title: "25+ Languages",    description: "Python, Go, Rust, Swift, Dart, Kotlin and more" },
    { icon: Users,    title: "Real-time Collab", description: "Code together with teammates in the same workspace" },
    { icon: Zap,      title: "AI-Powered",       description: "BuildForge AI generates full projects with one prompt" },
    { icon: Terminal, title: "Run & Preview",    description: "Execute code and preview web apps instantly" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SpaceBackground />

      {/* ─── Nav ─── */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
              <Braces className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="font-orbitron text-[13px] tracking-tighter text-foreground">
              code<span className="text-primary">forge</span>
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm"
              onClick={() => navigate("/typing")}
              className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground">
              Typing
            </Button>
            <Button variant="ghost" size="sm"
              onClick={() => navigate("/pricing")}
              className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground">
              Pricing
            </Button>

            {loading ? (
              <div className="h-7 w-7 animate-pulse rounded-full bg-muted" />
            ) : isAuthenticated ? (
              <>
                <CreditBadge className="hidden sm:inline-flex" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/15 text-[9px] font-semibold text-primary">
                          {getInitials(profile?.display_name || user?.email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                        {profile?.display_name || user?.email?.split("@")[0]}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer gap-2 text-xs">
                      <User className="h-3.5 w-3.5 text-muted-foreground" /> Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/my-rooms")} className="cursor-pointer gap-2 text-xs">
                      <Code className="h-3.5 w-3.5 text-muted-foreground" /> My Rooms
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer gap-2 text-xs">
                      <Settings className="h-3.5 w-3.5 text-muted-foreground" /> Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer gap-2 text-xs text-destructive">
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-accent"
              >
                <User className="h-3 w-3" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Section 1 · Hero ─── */}
      <section className="relative z-10 border-b border-border/50">
        <motion.div
          variants={container} initial="hidden" animate="show"
          className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28"
        >
          <motion.div variants={item}
            className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.07] px-3.5 py-1.5 text-[11px] text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            AI-powered collaborative coding
          </motion.div>

          <motion.h1 variants={item}
            className="font-orbitron mt-7 max-w-3xl text-4xl leading-[1.05] tracking-tighter text-foreground sm:text-6xl">
            Build, run and ship
            <br />
            <span className="text-primary">in one workspace.</span>
          </motion.h1>

          <motion.p variants={item}
            className="mt-6 max-w-xl text-sm leading-7 text-muted-foreground">
            CodeForge — real-time collaborative editor, instant preview and BuildForge AI
            that generates complete projects from a single prompt.
          </motion.p>

          <motion.div variants={item} className="mt-9 flex flex-wrap items-center gap-3">
            <button
              onClick={() => isAuthenticated ? navigate("/my-rooms") : setShowAuthModal(true)}
              className="flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-accent"
            >
              Start coding <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => navigate("/pricing")}
              className="flex h-10 items-center gap-2 rounded-md border border-border bg-card px-5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              View pricing
            </button>
          </motion.div>

          <motion.div variants={item} className="mt-14 grid max-w-2xl grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
            {[
              { value: "25+",   label: "Languages" },
              { value: "Live",  label: "Preview & Rooms" },
              { value: "Smart", label: "Built-in AI" },
            ].map((s) => (
              <div key={s.label} className="bg-card px-4 py-5">
                <p className="font-orbitron text-xl tracking-tighter text-primary">{s.value}</p>
                <p className="mt-1 text-[11px] font-medium text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ─── Section 2 · Workspace access ─── */}
      <section className="relative z-10 border-b border-border/50 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="font-jetbrains text-[10px] uppercase tracking-[0.24em] text-primary">/ workspace</p>
          <h2 className="font-orbitron mt-3 text-2xl tracking-tighter text-foreground sm:text-3xl">
            Create a room or join a session
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {/* New Room */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
                  <Plus className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-foreground">New Room</h3>
                  <p className="text-[11px] text-muted-foreground">Start a fresh session</p>
                </div>
              </div>
              <Input
                placeholder="Room name..."
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="mt-4 h-9 text-xs"
                onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()}
              />
              <button
                onClick={handleCreateRoom}
                disabled={isCreating}
                className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-semibold text-primary-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreating ? "Creating..." : "Create Room"}
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            {/* Join Room */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/40">
                  <LogIn className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-foreground">Join Room</h3>
                  <p className="text-[11px] text-muted-foreground">Connect to an existing one</p>
                </div>
              </div>
              <Input
                placeholder="Room ID or link..."
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                className="mt-4 h-9 text-xs"
                onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
              />
              <button
                onClick={handleJoinRoom}
                className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-muted/30 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                Join Room <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 3 · Features ─── */}
      <section className="relative z-10 border-b border-border/50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="font-jetbrains text-[10px] uppercase tracking-[0.24em] text-primary">/ capabilities</p>
          <h2 className="font-orbitron mt-3 text-2xl tracking-tighter text-foreground sm:text-3xl">
            Everything in one editor
          </h2>

          <motion.div
            className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4"
            variants={container} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}
          >
            {features.map((f) => (
              <motion.div key={f.title} variants={item} className="bg-card p-5">
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary/25 bg-primary/10">
                  <f.icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <h3 className="text-[13px] font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{f.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── Section 4 · Languages ─── */}
      <section className="relative z-10 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="font-jetbrains text-[10px] uppercase tracking-[0.24em] text-primary">/ languages</p>
          <h2 className="font-orbitron mt-3 text-2xl tracking-tighter text-foreground sm:text-3xl">
            25+ supported languages
          </h2>
          <div className="mt-7 flex flex-wrap gap-2">
            {LANGUAGES.map((lang) => (
              <span
                key={lang}
                className="font-jetbrains cursor-default rounded-md border border-border bg-card px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.07] hover:text-primary"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 border-t border-border/60 bg-background py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Braces className="h-3 w-3 text-primary/60" />
            <span className="font-orbitron text-[11px] tracking-tighter text-muted-foreground">codeforge</span>
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            Real-time coding, preview, and AI assistance in one workspace.
          </p>
        </div>
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
};

export default Index;
