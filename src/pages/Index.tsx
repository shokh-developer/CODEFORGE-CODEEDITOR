import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createRoom } from "@/hooks/useFiles";
import { useAuth } from "@/hooks/useAuth";
import AuthModal from "@/components/AuthModal";
import { Code, Users, ArrowRight, Plus, LogIn, Terminal, User, LogOut, Settings, Layers, Sparkles, Braces, Zap, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.23, 1, 0.32, 1] as const } },
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
    <div className="min-h-screen futuristic-bg relative overflow-hidden">
      {/* Floating orbs */}
      <div className="orb orb-primary w-[600px] h-[600px] -top-[200px] -left-[200px] animate-float" />
      <div className="orb orb-secondary w-[500px] h-[500px] -bottom-[150px] -right-[150px] animate-float" style={{ animationDelay: '3s' }} />
      <div className="orb orb-primary w-[300px] h-[300px] top-[40%] right-[10%] animate-float" style={{ animationDelay: '1.5s' }} />

      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass-card border-b border-primary/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 flex items-center justify-center glow-sm border border-primary/20">
              <Braces className="h-5 w-5 text-primary" />
            </div>
            <span className="font-orbitron font-bold text-foreground text-sm tracking-wider">CODEFORGE</span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/pricing")}
              className="text-muted-foreground hover:text-foreground text-xs font-medium"
            >
              Pricing
            </Button>
            
            {loading ? (
              <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
            ) : isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2.5 px-3 py-2 rounded-2xl glass-card hover:border-primary/30 transition-all duration-300">
                    <Avatar className="h-7 w-7 ring-1 ring-primary/30">
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-bold">
                        {getInitials(profile?.display_name || user?.email)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-foreground hidden sm:inline font-medium">
                      {profile?.display_name || user?.email?.split("@")[0]}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 glass-card border-primary/10 rounded-2xl">
                  <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer gap-2 rounded-xl">
                    <User className="h-4 w-4 text-muted-foreground" /> Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/my-rooms")} className="cursor-pointer gap-2 rounded-xl">
                    <Code className="h-4 w-4 text-muted-foreground" /> My Rooms
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer gap-2 rounded-xl">
                    <Settings className="h-4 w-4 text-muted-foreground" /> Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/50" />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer gap-2 rounded-xl">
                    <LogOut className="h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button onClick={() => setShowAuthModal(true)} className="btn-futuristic px-5 py-2.5 text-xs font-bold flex items-center gap-2">
                <User className="h-3.5 w-3.5" /> Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section - Split layout */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-24">
          {/* Left: Hero text */}
          <motion.div variants={container} initial="hidden" animate="show">
            <motion.div variants={item}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card border-primary/20 text-primary text-xs font-semibold mb-8">
                <Sparkles className="h-3.5 w-3.5" />
                Real-time Collaborative IDE
              </div>
            </motion.div>
            
            <motion.h1 variants={item} className="text-5xl sm:text-6xl lg:text-7xl font-orbitron font-black tracking-tight leading-[1.05] mb-6">
              <span className="gradient-text glow-text">BUILD.</span>
              <br />
              <span className="gradient-text glow-text">CODE.</span>
              <br />
              <span className="text-foreground">DEPLOY.</span>
            </motion.h1>
            
            <motion.p variants={item} className="text-base sm:text-lg text-muted-foreground max-w-md leading-relaxed mb-8">
              The next-gen collaborative coding platform.
              Write, run, and ship code in real time with 10+ languages and AI assistance.
            </motion.p>

            <motion.div variants={item} className="flex flex-wrap gap-3">
              <button onClick={() => document.getElementById('create-room')?.focus()} className="btn-futuristic px-8 py-3.5 text-sm font-bold flex items-center gap-2">
                Get Started <ArrowRight className="h-4 w-4" />
              </button>
              <Button variant="ghost" size="lg" className="rounded-full border border-border/60 text-foreground hover:border-primary/40 hover:bg-primary/5 px-8" onClick={() => navigate("/pricing")}>
                View Plans
              </Button>
            </motion.div>
          </motion.div>

          {/* Right: Glass panel with profile + actions */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            {/* Profile card */}
            {isAuthenticated && profile && (
              <motion.div variants={item} className="glass-card rounded-2xl p-6 border-primary/10">
                <div className="flex items-center gap-4 mb-4">
                  <Avatar className="h-14 w-14 ring-2 ring-primary/30 glow-sm">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/15 text-primary text-lg font-bold">
                      {getInitials(profile?.display_name || user?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-foreground font-bold text-base">{profile?.display_name || 'User'}</h3>
                    <p className="text-muted-foreground text-sm">{user?.email}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="rounded-full flex-1 border border-border/60 text-xs" onClick={() => navigate("/my-rooms")}>
                    <Code className="h-3.5 w-3.5 mr-1.5" /> My Rooms
                  </Button>
                  <Button variant="ghost" size="sm" className="rounded-full flex-1 border border-border/60 text-xs" onClick={() => navigate("/profile")}>
                    <User className="h-3.5 w-3.5 mr-1.5" /> Profile
                  </Button>
                </div>
              </motion.div>
            )}

            {/* New Room card */}
            <motion.div variants={item} className="glass-card-hover rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center glow-sm border border-primary/20">
                  <Plus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">New Room</h2>
                  <p className="text-xs text-muted-foreground">Start a coding session</p>
                </div>
              </div>
              <Input
                id="create-room"
                placeholder="Room name..."
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="h-11 text-sm glow-input rounded-xl"
                onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()}
              />
              <button className="btn-futuristic w-full h-11 text-sm font-bold flex items-center justify-center gap-2" onClick={handleCreateRoom} disabled={isCreating}>
                {isCreating ? "Creating..." : "Create Room"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>

            {/* Join Room card */}
            <motion.div variants={item} className="glass-card-hover rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center border border-border/60">
                  <LogIn className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">Join Room</h2>
                  <p className="text-xs text-muted-foreground">Connect to existing room</p>
                </div>
              </div>
              <Input
                placeholder="Room ID or link..."
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                className="h-11 text-sm glow-input rounded-xl"
                onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
              />
              <Button variant="secondary" className="w-full h-11 text-sm font-semibold gap-2 rounded-full border border-border/60" onClick={handleJoinRoom}>
                Join Room <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        </div>

        {/* Features */}
        <motion.div
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto mb-20"
          variants={container}
          initial="hidden"
          animate="show"
        >
          {features.map((feature, i) => (
            <motion.div key={i} variants={item} className="glass-card-hover rounded-2xl p-6 text-center group">
              <div className="inline-flex w-14 h-14 items-center justify-center rounded-2xl bg-primary/10 mb-4 border border-primary/15 group-hover:glow-md transition-all duration-300">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-2">{feature.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Languages */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <p className="text-[10px] text-muted-foreground mb-5 uppercase tracking-[0.25em] font-semibold font-orbitron">Supported Languages</p>
          <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
            {["C++", "Python", "JavaScript", "TypeScript", "Java", "Go", "Rust", "PHP", "Ruby", "C#", "C"].map((lang) => (
              <span
                key={lang}
                className="px-4 py-2 text-[11px] font-jetbrains rounded-full glass-card border-primary/10 text-muted-foreground hover:text-primary hover:border-primary/30 hover:glow-sm transition-all duration-300 cursor-default"
              >
                {lang}
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="border-t border-primary/10 py-10 relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <Braces className="h-4 w-4 text-primary/60" />
            <span className="font-orbitron font-bold text-foreground/60 text-xs tracking-wider">CODEFORGE</span>
          </div>
          <p className="text-muted-foreground text-[11px]">
            by <span className="text-primary/70 font-medium">shokh</span> — Next-gen collaborative coding platform
          </p>
        </div>
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
};

export default Index;
