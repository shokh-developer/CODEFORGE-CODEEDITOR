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
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.23, 1, 0.32, 1] as const } },
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
    { icon: Layers,   title: "25+ Languages",   description: "Python, Go, Rust, Swift, Dart, Kotlin and more" },
    { icon: Users,    title: "Real-time Collab", description: "Code together with teammates in the same workspace" },
    { icon: Zap,      title: "AI-Powered",       description: "BuildForge AI generates full projects with one prompt" },
    { icon: Terminal, title: "Run & Preview",    description: "Execute code and preview web apps instantly" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "transparent", color: "#f1f5f9" }}>
      <SpaceBackground />

      {/* ─── Nav ─── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/50 backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-13 flex items-center justify-between" style={{ height: "52px" }}>
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}>
              <Braces className="h-3 w-3" style={{ color: "#a78bfa" }} />
            </div>
            <span className="font-orbitron text-[12px] tracking-tight text-white/90">CodeForge</span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="sm"
              onClick={() => navigate("/typing")}
              className="text-xs h-8 px-3 text-white/50 hover:text-white/80 hover:bg-white/[0.06]"
            >
              Typing
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => navigate("/pricing")}
              className="text-xs h-8 px-3 text-white/50 hover:text-white/80 hover:bg-white/[0.06]"
            >
              Pricing
            </Button>

            {loading ? (
              <div className="w-7 h-7 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
            ) : isAuthenticated ? (
              <>
                <CreditBadge className="hidden sm:inline-flex" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-white/[0.06]">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-[9px] font-semibold"
                          style={{ background: "rgba(139,92,246,0.2)", color: "#a78bfa" }}>
                          {getInitials(profile?.display_name || user?.email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs hidden sm:inline font-medium text-white/70">
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
                    <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer gap-2 text-xs">
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-medium text-white transition-all duration-200"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  boxShadow: "0 0 18px rgba(124,58,237,0.35)",
                }}
              >
                <User className="h-3 w-3" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Main ─── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-14 pb-14 relative z-10">
        <motion.div
          variants={container} initial="hidden" animate="show"
          className="grid lg:grid-cols-[1fr_370px] gap-8 xl:gap-10 items-start"
        >
          {/* ─── Left: Hero ─── */}
          <div className="space-y-6 pt-2 lg:pt-6">

            {/* Status pill */}
            <motion.div variants={item}
              className="inline-flex items-center gap-2 rounded-full text-[11px] px-3.5 py-1.5"
              style={{
                border: "1px solid rgba(139,92,246,0.22)",
                background: "rgba(139,92,246,0.08)",
                color: "rgba(196,181,253,0.85)",
              }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                  style={{ background: "#a78bfa" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#a78bfa" }} />
              </span>
              AI-powered collaborative coding
            </motion.div>

            {/* Eyebrow + Heading */}
            <div className="space-y-4">
              <motion.p variants={item}
                className="font-mono text-[10px] uppercase tracking-[0.22em] font-medium"
                style={{ color: "rgba(167,139,250,0.65)" }}
              >
                High-end developer experience
              </motion.p>

              <motion.div variants={item}>
                <h1 className="font-orbitron leading-[1.06] tracking-tight">
                  <span
                    className="block"
                    style={{
                      fontSize: "clamp(2.4rem, 5.5vw, 3.8rem)",
                      background: "linear-gradient(135deg, #c4b5fd 0%, #818cf8 50%, #7dd3fc 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    BUILD.
                  </span>
                  <span className="block text-white" style={{ fontSize: "clamp(2.4rem, 5.5vw, 3.8rem)" }}>
                    CODE.
                  </span>
                  <span className="block" style={{ fontSize: "clamp(2.4rem, 5.5vw, 3.8rem)", color: "rgba(255,255,255,0.28)" }}>
                    DEPLOY.
                  </span>
                </h1>
              </motion.div>

              <motion.p variants={item} className="text-[13px] leading-7 max-w-[400px]" style={{ color: "#94a3b8" }}>
                Write, run, preview, and ship projects in one premium workspace — with live collaboration and AI assistance.
              </motion.p>
            </div>

            {/* Stat cards */}
            <motion.div variants={item} className="grid grid-cols-3 gap-2 max-w-[320px]">
              {[
                { value: "25+",   label: "Languages" },
                { value: "Live",  label: "Preview & Rooms" },
                { value: "Smart", label: "Built-in AI" },
              ].map((s, i) => (
                <div key={i}
                  className="rounded-xl px-3 py-3 transition-all duration-200 cursor-default"
                  style={{
                    border: "1px solid rgba(255,255,255,0.07)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <p className="text-base font-orbitron text-white tracking-tight">{s.value}</p>
                  <p className="text-[10px] mt-0.5 font-medium" style={{ color: "#475569" }}>{s.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          {/* ─── Right: Workspace Access ─── */}
          <div className="space-y-3 lg:pt-4">

            {/* Main card */}
            <motion.div variants={item}
              className="rounded-2xl p-4 space-y-4"
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                backdropFilter: "blur(16px)",
              }}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-orbitron text-[13px] text-white tracking-tight">Workspace Access</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#475569" }}>
                    Create a room or join an existing session.
                  </p>
                </div>
                <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-lg"
                  style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
                  <Code className="h-3.5 w-3.5" style={{ color: "rgba(167,139,250,0.65)" }} />
                </div>
              </div>

              {/* Room cards */}
              <div className="grid sm:grid-cols-2 gap-2.5">

                {/* New Room */}
                <div className="rounded-xl p-3.5 space-y-3 group transition-all duration-200"
                  style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)" }}>
                      <Plus className="h-3 w-3" style={{ color: "#a78bfa" }} />
                    </div>
                    <div>
                      <h2 className="text-[11px] font-semibold text-white">New Room</h2>
                      <p className="text-[10px]" style={{ color: "#475569" }}>Start a session</p>
                    </div>
                  </div>
                  <Input
                    placeholder="Room name..."
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="h-8 text-xs bg-transparent text-white placeholder:text-slate-600"
                    style={{ borderColor: "rgba(255,255,255,0.1)" }}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()}
                  />
                  <button
                    onClick={handleCreateRoom}
                    disabled={isCreating}
                    className="w-full h-8 rounded-lg text-xs font-medium text-white flex items-center justify-center gap-1.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #4338ca)" }}
                  >
                    {isCreating ? "Creating..." : "Create Room"}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>

                {/* Join Room */}
                <div className="rounded-xl p-3.5 space-y-3 transition-all duration-200"
                  style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)" }}>
                      <LogIn className="h-3 w-3" style={{ color: "#64748b" }} />
                    </div>
                    <div>
                      <h2 className="text-[11px] font-semibold text-white">Join Room</h2>
                      <p className="text-[10px]" style={{ color: "#475569" }}>Connect to existing</p>
                    </div>
                  </div>
                  <Input
                    placeholder="Room ID or link..."
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value)}
                    className="h-8 text-xs bg-transparent text-white placeholder:text-slate-600"
                    style={{ borderColor: "rgba(255,255,255,0.1)" }}
                    onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                  />
                  <button
                    onClick={handleJoinRoom}
                    className="w-full h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all duration-200"
                    style={{
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(255,255,255,0.05)",
                      color: "#94a3b8",
                    }}
                  >
                    Join Room <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Feature grid */}
            <motion.div className="grid sm:grid-cols-2 gap-2" variants={container} initial="hidden" animate="show">
              {features.map((f, i) => (
                <motion.div key={i} variants={item}
                  className="rounded-xl p-3 transition-all duration-200"
                  style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
                >
                  <div className="inline-flex w-7 h-7 items-center justify-center rounded-lg mb-2"
                    style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.18)" }}>
                    <f.icon className="h-3 w-3" style={{ color: "#a78bfa" }} />
                  </div>
                  <h3 className="text-[11px] font-semibold text-white mb-0.5">{f.title}</h3>
                  <p className="text-[10px] leading-relaxed" style={{ color: "#475569" }}>{f.description}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.div>

        {/* ─── Supported Languages ─── */}
        <div className="mt-10 pt-8" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[10px] mb-3 uppercase tracking-[0.16em] font-medium text-center lg:text-left"
            style={{ color: "#334155" }}>
            Supported Languages
          </p>
          <div className="flex flex-wrap justify-center lg:justify-start gap-1.5">
            {LANGUAGES.map((lang) => (
              <span
                key={lang}
                className="font-jetbrains cursor-default transition-all duration-150"
                style={{
                  fontSize: "10px",
                  padding: "3px 10px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.07)",
                  background: "rgba(255,255,255,0.03)",
                  color: "#475569",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.color = "#c4b5fd";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.28)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.07)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.color = "#475569";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                }}
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 py-5 backdrop-blur-sm"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.25)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Braces className="h-3 w-3" style={{ color: "rgba(167,139,250,0.4)" }} />
            <span className="font-orbitron text-[11px] tracking-tight" style={{ color: "rgba(255,255,255,0.35)" }}>
              CodeForge
            </span>
          </div>
          <p className="text-[10px]" style={{ color: "#334155" }}>
            Real-time coding, preview, and AI assistance in one workspace.
          </p>
        </div>
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
};

export default Index;
