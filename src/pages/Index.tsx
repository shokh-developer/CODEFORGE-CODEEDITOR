import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
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
import { Code, Users, ArrowRight, Plus, LogIn, Terminal, User, LogOut, Settings, Layers, Zap, Braces } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] as const } },
};

const Index = () => {
  const [roomName, setRoomName] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
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
    { icon: Layers, title: "10+ Languages", description: "C++, Python, JavaScript, Java, Go, Rust, TypeScript and more" },
    { icon: Users, title: "Real-time Collab", description: "Code together with teammates in the same workspace live" },
    { icon: Zap, title: "AI-Powered", description: "Smart completions and AI assistant built right into the editor" },
    { icon: Terminal, title: "Run & Preview", description: "Execute code and preview web pages directly in browser" },
  ];

  return (
    <div className="min-h-screen futuristic-bg text-foreground">
      <div className="orb orb-primary -left-24 top-12 hidden lg:block" />
      <div className="orb orb-secondary right-0 top-36 hidden lg:block" />

      <nav className="sticky top-0 z-50 border-b border-foreground/10 bg-background/55 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl glass-card flex items-center justify-center">
              <Braces className="h-4 w-4 text-primary" />
            </div>
            <span className="font-orbitron text-sm text-foreground">CodeForge</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/pricing")}
              className="text-muted-foreground hover:text-foreground text-sm hover:bg-white/5"
            >
              Pricing
            </Button>

            {loading ? (
              <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
            ) : isAuthenticated ? (
              <>
              <CreditBadge className="hidden sm:inline-flex" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/5 transition-colors">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                        {getInitials(profile?.display_name || user?.email)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-foreground hidden sm:inline">
                      {profile?.display_name || user?.email?.split("@")[0]}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer gap-2">
                    <User className="h-4 w-4 text-muted-foreground" /> Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/my-rooms")} className="cursor-pointer gap-2">
                    <Code className="h-4 w-4 text-muted-foreground" /> My Rooms
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer gap-2">
                    <LogOut className="h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </>
            ) : (
              <Button size="sm" onClick={() => setShowAuthModal(true)} className="btn-futuristic gap-2 border-0 px-4">
                <User className="h-3.5 w-3.5 relative z-10" /> <span className="relative z-10">Sign In</span>
              </Button>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 sm:pt-18 pb-16 relative z-10">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid lg:grid-cols-[1.05fr_0.95fr] gap-8 xl:gap-14 items-start min-h-[calc(100vh-11rem)]"
        >
          <div className="space-y-8 pt-4 lg:pt-10">
            <motion.div variants={item} className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-white/5 px-4 py-2 text-xs text-muted-foreground glow-sm">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              AI-powered collaborative coding workspace
            </motion.div>

            <div className="space-y-5 max-w-2xl">
              <motion.p variants={item} className="font-orbitron text-sm text-primary glow-text">
                High-end developer experience
              </motion.p>

              <motion.div variants={item} className="space-y-2">
                <h1 className="font-orbitron text-5xl sm:text-6xl xl:text-7xl leading-none">
                  <span className="block gradient-text">BUILD.</span>
                  <span className="block text-foreground">CODE.</span>
                  <span className="block text-foreground/70">DEPLOY.</span>
                </h1>
              </motion.div>

              <motion.p variants={item} className="text-base sm:text-lg text-muted-foreground max-w-xl leading-8">
                Write, run, preview, and ship projects in one premium workspace with live collaboration and AI assistance.
              </motion.p>
            </div>

            <motion.div variants={item} className="grid sm:grid-cols-3 gap-3 max-w-2xl">
              <div className="glass-card rounded-2xl px-4 py-4">
                <p className="text-2xl font-orbitron text-foreground">10+</p>
                <p className="text-xs text-muted-foreground mt-1">Languages ready</p>
              </div>
              <div className="glass-card rounded-2xl px-4 py-4">
                <p className="text-2xl font-orbitron text-foreground">Live</p>
                <p className="text-xs text-muted-foreground mt-1">Preview and rooms</p>
              </div>
              <div className="glass-card rounded-2xl px-4 py-4">
                <p className="text-2xl font-orbitron text-foreground">Smart</p>
                <p className="text-xs text-muted-foreground mt-1">Built-in AI help</p>
              </div>
            </motion.div>
          </div>

          <div className="space-y-5 lg:pt-4">
            <motion.div variants={item} className="glass-card rounded-[28px] p-5 sm:p-6 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-orbitron text-lg text-foreground">Workspace Access</p>
                  <p className="text-sm text-muted-foreground mt-1">Create a room or join an existing coding session.</p>
                </div>
                <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl border border-foreground/10 bg-white/5">
                  <Code className="h-5 w-5 text-primary" />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <motion.div variants={item} className="glass-card glass-card-hover rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                      <Plus className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">New Room</h2>
                      <p className="text-xs text-muted-foreground">Start a coding session</p>
                    </div>
                  </div>
                  <Input
                    id="create-room"
                    placeholder="Room name..."
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="h-11 text-sm glow-input bg-transparent"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()}
                  />
                  <Button className="w-full h-11 text-sm gap-2 btn-futuristic border-0" onClick={handleCreateRoom} disabled={isCreating}>
                    <span className="relative z-10">{isCreating ? "Creating..." : "Create Room"}</span>
                    <ArrowRight className="h-4 w-4 relative z-10" />
                  </Button>
                </motion.div>

                <motion.div variants={item} className="glass-card glass-card-hover rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center border border-foreground/10">
                      <LogIn className="h-5 w-5 text-foreground/80" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Join Room</h2>
                      <p className="text-xs text-muted-foreground">Connect to existing room</p>
                    </div>
                  </div>
                  <Input
                    placeholder="Room ID or link..."
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value)}
                    className="h-11 text-sm glow-input bg-transparent"
                    onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                  />
                  <Button className="w-full h-11 text-sm gap-2 rounded-full border border-foreground/10 bg-white/5 text-foreground hover:bg-white/10" onClick={handleJoinRoom}>
                    Join Room <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              </div>
            </motion.div>

            <motion.div className="grid sm:grid-cols-2 gap-3" variants={container} initial="hidden" animate="show">
              {features.map((feature, i) => (
                <motion.div key={i} variants={item} className="glass-card rounded-2xl p-4">
                  <div className="inline-flex w-10 h-10 items-center justify-center rounded-2xl bg-primary/10 mb-3 border border-primary/20">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.div>

        <div className="mt-8">
          <p className="text-[11px] text-muted-foreground mb-3 uppercase tracking-wider text-center lg:text-left">Supported Languages</p>
          <div className="flex flex-wrap justify-center lg:justify-start gap-2 max-w-3xl">
            {["C++", "Python", "JavaScript", "TypeScript", "Java", "Go", "Rust", "PHP", "Ruby", "C#", "C"].map((lang) => (
              <span
                key={lang}
                className="px-3 py-1.5 text-[11px] font-jetbrains rounded-full bg-white/5 border border-foreground/10 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors cursor-default"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      </div>

      <footer className="border-t border-foreground/10 py-8 relative z-10 bg-background/25 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center lg:text-left lg:flex lg:items-center lg:justify-between">
          <div className="flex items-center justify-center gap-2 mb-1 lg:mb-0 lg:justify-start">
            <Braces className="h-4 w-4 text-primary/70" />
            <span className="font-orbitron text-foreground/70 text-xs">CodeForge</span>
          </div>
          <p className="text-muted-foreground text-[11px] mt-2 lg:mt-0">
            Real-time coding, preview, and AI assistance in one workspace.
          </p>
        </div>
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
};

export default Index;
