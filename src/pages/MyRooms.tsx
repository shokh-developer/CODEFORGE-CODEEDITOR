import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, Users, Clock, Trash2, ExternalLink, Loader2,
  FolderOpen, Crown, Search, Code2, FileCode, LayoutGrid, List,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Room { id: string; name: string; language: string; created_at: string; created_by: string | null; }
interface RoomMembership { room_id: string; joined_at: string; rooms: Room; }

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

const langColors: Record<string, string> = {
  javascript: "text-yellow-400 bg-yellow-400/10",
  typescript: "text-blue-400 bg-blue-400/10",
  python: "text-green-400 bg-green-400/10",
  html: "text-orange-400 bg-orange-400/10",
  css: "text-purple-400 bg-purple-400/10",
  java: "text-red-400 bg-red-400/10",
  cpp: "text-cyan-400 bg-cyan-400/10",
};

const MyRooms = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [createdRooms, setCreatedRooms] = useState<Room[]>([]);
  const [joinedRooms, setJoinedRooms] = useState<RoomMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteRoomId, setDeleteRoomId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});

  useEffect(() => { if (!authLoading && !isAuthenticated) navigate("/"); }, [authLoading, isAuthenticated, navigate]);
  useEffect(() => { if (user) fetchRooms(); }, [user]);

  const fetchRooms = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data: created } = await supabase.from("rooms").select("*").eq("created_by", user.id).order("created_at", { ascending: false });
      setCreatedRooms(created || []);

      const { data: memberships } = await supabase.from("room_members").select(`room_id, joined_at, rooms (*)`).eq("user_id", user.id).order("joined_at", { ascending: false });
      setJoinedRooms((memberships || []).filter((m: any) => m.rooms && m.rooms.created_by !== user.id) as RoomMembership[]);

      // Get file counts for all rooms
      const allRoomIds = [...(created || []).map(r => r.id), ...(memberships || []).map((m: any) => m.room_id)];
      if (allRoomIds.length > 0) {
        const { data: fileData } = await supabase.from("files").select("room_id").in("room_id", allRoomIds).eq("is_folder", false);
        const counts: Record<string, number> = {};
        (fileData || []).forEach(f => { counts[f.room_id] = (counts[f.room_id] || 0) + 1; });
        setFileCounts(counts);
      }
    } catch { toast({ title: "Error", description: "Failed to load rooms", variant: "destructive" }); }
    finally { setIsLoading(false); }
  };

  const handleDeleteRoom = async () => {
    if (!deleteRoomId) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("rooms").delete().eq("id", deleteRoomId);
      if (error) throw error;
      setCreatedRooms(prev => prev.filter(r => r.id !== deleteRoomId));
      toast({ title: "Room deleted" });
    } catch (error: any) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    finally { setIsDeleting(false); setDeleteRoomId(null); }
  };

  const handleLeaveRoom = async (roomId: string) => {
    if (!user) return;
    try {
      await supabase.from("room_members").delete().eq("room_id", roomId).eq("user_id", user.id);
      setJoinedRooms(prev => prev.filter(r => r.room_id !== roomId));
      toast({ title: "Left room" });
    } catch { toast({ title: "Error", description: "Failed to leave room", variant: "destructive" }); }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const filteredCreated = createdRooms.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredJoined = joinedRooms.filter(m => m.rooms.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const totalProjects = createdRooms.length + joinedRooms.length;
  const totalFiles = Object.values(fileCounts).reduce((a, b) => a + b, 0);

  if (authLoading || isLoading) return (
    <div className="min-h-screen futuristic-bg flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  const RoomCard = ({ room, onOpen, onDelete, joinDate, isOwner }: any) => (
    <motion.div
      variants={item}
      className={`glass-card rounded-xl overflow-hidden group hover:border-primary/30 transition-all duration-200 ${viewMode === "grid" ? "" : "flex items-center"}`}
    >
      {/* Color bar */}
      <div className={`${viewMode === "grid" ? "h-1" : "w-1 h-full"} bg-gradient-to-r from-primary/60 to-accent/60`} />

      <div className={`p-4 ${viewMode === "list" ? "flex items-center justify-between flex-1 gap-4" : ""}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-foreground text-sm truncate">{room.name}</h3>
            {isOwner && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium border border-primary/20">Owner</span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium ${langColors[room.language] || "bg-muted text-muted-foreground"}`}>
              {room.language}
            </span>
            <span className="flex items-center gap-1">
              <FileCode className="h-3 w-3" />
              {fileCounts[room.id] || 0} files
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(joinDate || room.created_at)}
            </span>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 ${viewMode === "grid" ? "mt-3" : ""}`}>
          <Button
            variant="outline" size="sm"
            onClick={() => onOpen(room.id)}
            className="h-8 gap-1.5 text-xs flex-1 md:flex-none border-border/50 hover:border-primary/50 hover:bg-primary/5"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </Button>
          <Button
            variant="ghost" size="icon"
            onClick={() => onDelete(room.id)}
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen futuristic-bg relative">
      <div className="max-w-5xl mx-auto px-6 py-8 relative z-10">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
          <Button variant="ghost" onClick={() => navigate("/")} className="gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Button size="sm" onClick={() => navigate("/")} className="gap-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30">
            <Plus className="h-3.5 w-3.5" /> New Project
          </Button>
        </motion.div>

        {/* Title + Stats */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border border-primary/20">
              <FolderOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">My Projects</h1>
              <p className="text-xs text-muted-foreground">Manage your coding workspaces</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Projects", value: totalProjects, icon: Code2, color: "text-primary" },
              { label: "Total Files", value: totalFiles, icon: FileCode, color: "text-emerald-400" },
              { label: "Collaborations", value: joinedRooms.length, icon: Users, color: "text-blue-400" },
            ].map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
                className="glass-card rounded-xl p-3 text-center"
              >
                <stat.icon className={`h-4 w-4 mx-auto mb-1 ${stat.color}`} />
                <p className="text-lg font-bold text-foreground">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Search + View Toggle */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="flex gap-2 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="pl-9 h-9 text-sm bg-background/50 border-border/50"
            />
          </div>
          <div className="flex border border-border/50 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode("grid")} className={`p-2 ${viewMode === "grid" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode("list")} className={`p-2 ${viewMode === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50"}`}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </motion.div>

        {/* Created Rooms */}
        <section className="mb-8">
          <h2 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2 uppercase tracking-[0.15em]">
            <Crown className="h-3.5 w-3.5 text-primary" /> My Projects ({filteredCreated.length})
          </h2>
          {filteredCreated.length === 0 ? (
            <div className="glass-card rounded-xl p-10 text-center">
              <div className="h-12 w-12 rounded-xl bg-muted/20 flex items-center justify-center mx-auto mb-3">
                <Code2 className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground mb-3">No projects yet</p>
              <Button size="sm" onClick={() => navigate("/")} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Create Project</Button>
            </div>
          ) : (
            <motion.div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" : "space-y-2"} variants={container} initial="hidden" animate="show">
              {filteredCreated.map(room => (
                <RoomCard key={room.id} room={room} isOwner onOpen={(id: string) => navigate(`/room/${id}`)} onDelete={(id: string) => setDeleteRoomId(id)} />
              ))}
            </motion.div>
          )}
        </section>

        {/* Joined Rooms */}
        <section>
          <h2 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2 uppercase tracking-[0.15em]">
            <Users className="h-3.5 w-3.5 text-muted-foreground" /> Collaborations ({filteredJoined.length})
          </h2>
          {filteredJoined.length === 0 ? (
            <div className="glass-card rounded-xl p-8 text-center">
              <p className="text-sm text-muted-foreground">No collaborations yet</p>
            </div>
          ) : (
            <motion.div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" : "space-y-2"} variants={container} initial="hidden" animate="show">
              {filteredJoined.map(m => (
                <RoomCard key={m.room_id} room={m.rooms} joinDate={m.joined_at} onOpen={(id: string) => navigate(`/room/${id}`)} onDelete={(id: string) => handleLeaveRoom(id)} />
              ))}
            </motion.div>
          )}
        </section>
      </div>

      <AlertDialog open={!!deleteRoomId} onOpenChange={() => setDeleteRoomId(null)}>
        <AlertDialogContent className="glass-card rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>This project and all its files will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRoom} disabled={isDeleting} className="bg-destructive text-destructive-foreground">
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MyRooms;
