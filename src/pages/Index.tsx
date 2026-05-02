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
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center border border-primary/20">
              <Braces className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground text-sm">CodeForge</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/pricing")}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Pricing
            </Button>

            {loading ? (
              <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
            ) : isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors">
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
            ) : (
              <Button size="sm" onClick={() => setShowAuthModal(true)} className="gap-2">
                <User className="h-3.5 w-3.5" /> Sign In
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero — centered classic layout */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="text-center mb-14"
        >
          <motion.h1
            variants={item}
            className="text-5xl sm:text-7xl font-bold tracking-tight mb-3 bg-gradient-to-r from-[#7aa2f7] via-[#bb9af7] to-[#f7768e] bg-clip-text text-transparent"
          >
            CodeForge
          </motion.h1>
          <motion.p variants={item} className="text-xs text-muted-foreground mb-4">
            by <span className="text-primary font-medium">shokh</span>
          </motion.p>
          <motion.p
            variants={item}
            className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto"
          >
            Write, run, and collaborate on code in real time with your team.
            <br />
            C++, Python, JavaScript, and 10+ languages.
          </motion.p>
        </motion.div>

        {/* Two cards in a row */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto mb-16"
        >
          {/* New Room */}
          <motion.div variants={item} className="bg-card border border-border rounded-md p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center border border-primary/20">
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
              className="h-10 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleCreateRoom()}
            />
            <Button
              className="w-full h-10 text-sm gap-2 bg-gradient-to-r from-[#7aa2f7] to-[#bb9af7] hover:from-[#7aa2f7]/90 hover:to-[#bb9af7]/90 text-white border-0 shadow-md shadow-primary/20"
              onClick={handleCreateRoom}
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "Create Room"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>

          {/* Join Room */}
          <motion.div variants={item} className="bg-card border border-border rounded-md p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center border border-border">
                <LogIn className="h-5 w-5 text-muted-foreground" />
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
              className="h-10 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
            />
            <Button
              className="w-full h-10 text-sm gap-2 bg-[#f7768e] hover:bg-[#f7768e]/90 text-white border-0 shadow-md shadow-[#f7768e]/20"
              onClick={handleJoinRoom}
            >
              Join <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        </motion.div>

        {/* Features */}
        <motion.div
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-5xl mx-auto mb-14"
          variants={container}
          initial="hidden"
          animate="show"
        >
          {features.map((feature, i) => (
            <motion.div key={i} variants={item} className="bg-card border border-border rounded-md p-4">
              <div className="inline-flex w-10 h-10 items-center justify-center rounded-md bg-primary/10 mb-3 border border-primary/20">
                <feature.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{feature.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Languages */}
        <div className="text-center">
          <p className="text-[11px] text-muted-foreground mb-3 uppercase tracking-wider">Supported Languages</p>
          <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
            {["C++", "Python", "JavaScript", "TypeScript", "Java", "Go", "Rust", "PHP", "Ruby", "C#", "C"].map((lang) => (
              <span
                key={lang}
                className="px-3 py-1 text-[11px] font-jetbrains rounded-md bg-secondary border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors cursor-default"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Braces className="h-4 w-4 text-primary/70" />
            <span className="font-semibold text-foreground/70 text-xs">CodeForge</span>
          </div>
          <p className="text-muted-foreground text-[11px]">
            by <span className="text-primary/80 font-medium">shokh</span>
          </p>
        </div>
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
};

export default Index;
