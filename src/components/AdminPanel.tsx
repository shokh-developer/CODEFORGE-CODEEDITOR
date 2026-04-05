import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Users, Ban, VolumeX, UserX, Crown, Trash2, Clock, Sparkles, CreditCard } from "lucide-react";

type AppRole = "admin" | "moderator" | "user";
type PlanType = "free" | "pro" | "team" | "enterprise";
interface User { user_id: string; display_name: string | null; avatar_url: string | null; role: AppRole; ai_enabled?: boolean; plan?: PlanType; }
interface UserBan { id: string; user_id: string; room_id: string | null; banned_by: string; ban_type: "ban" | "kick" | "mute"; reason: string | null; expires_at: string | null; created_at: string; }
interface AdminPanelProps { roomId?: string; }

const AdminPanel = ({ roomId }: AdminPanelProps) => {
  const { isAdmin, isModerator, getAllUsers, banUser, unbanUser, getBans, setUserRole } = useAdmin();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [bans, setBans] = useState<UserBan[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [banType, setBanType] = useState<"ban" | "kick" | "mute">("mute");
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState("1h");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open && isModerator) loadData(); }, [open, isModerator]);

  const loadData = async () => {
    const [usersData, bansData] = await Promise.all([getAllUsers(), getBans(roomId)]);
    const { data: aiAccessData } = await supabase.from("user_ai_access").select("user_id, ai_enabled");
    const aiMap = new Map(aiAccessData?.map(a => [a.user_id, a.ai_enabled]) || []);
    const { data: subData } = await supabase.from("user_subscriptions").select("user_id, plan");
    const subMap = new Map(subData?.map((s: any) => [s.user_id, s.plan as PlanType]) || []);
    setUsers(usersData.map(u => ({ ...u, ai_enabled: aiMap.get(u.user_id) ?? true, plan: subMap.get(u.user_id) || "free" })));
    setBans(bansData);
  };

  const toggleUserAI = async (userId: string, current: boolean) => {
    if (!isAdmin) { toast({ title: "Only admins can change this", variant: "destructive" }); return; }
    const next = !current;
    const { error } = await supabase.from("user_ai_access")
      .upsert({ user_id: userId, ai_enabled: next, disabled_by: next ? null : (await supabase.auth.getUser()).data.user?.id, disabled_at: next ? null : new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, ai_enabled: next } : u)); toast({ title: next ? "AI enabled" : "AI disabled" }); }
  };

  const handleBan = async () => {
    if (!selectedUser) { toast({ title: "Select a user", variant: "destructive" }); return; }
    setLoading(true);
    let expiresAt: Date | undefined;
    if (banDuration !== "forever") { expiresAt = new Date(); expiresAt.setHours(expiresAt.getHours() + parseInt(banDuration)); }
    const targetRoomId = banType === "ban" ? undefined : roomId;
    const { error } = await banUser(selectedUser, banType, targetRoomId, banReason, expiresAt);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else {
      if (banType === "kick" && roomId) await supabase.from("room_members").delete().eq("room_id", roomId).eq("user_id", selectedUser);
      toast({ title: banType === "ban" ? "Banned" : banType === "mute" ? "Muted" : "Kicked" });
      loadData(); setSelectedUser(""); setBanReason("");
    }
    setLoading(false);
  };

  const handleUnban = async (banId: string) => {
    const { error } = await unbanUser(banId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Restriction removed" }); loadData(); }
  };

  const handleRoleChange = async (userId: string, role: AppRole) => {
    if (!isAdmin) { toast({ title: "Only admins can change roles", variant: "destructive" }); return; }
    const { error } = await setUserRole(userId, role);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Role updated" }); loadData(); }
  };

  const handlePlanChange = async (userId: string, plan: PlanType) => {
    if (!isAdmin) { toast({ title: "Only admins can change plans", variant: "destructive" }); return; }
    const currentUser = (await supabase.auth.getUser()).data.user;
    const { error } = await supabase.from("user_subscriptions" as any)
      .upsert({ user_id: userId, plan, assigned_by: currentUser?.id, assigned_at: new Date().toISOString() } as any, { onConflict: 'user_id' } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, plan } : u)); toast({ title: "Plan updated", description: `Set to ${plan}` }); }
  };

  const getPlanBadge = (plan: PlanType) => {
    const colors: Record<PlanType, string> = {
      free: "bg-muted text-muted-foreground",
      pro: "bg-primary/20 text-primary border-primary/30",
      team: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      enterprise: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    };
    return <Badge className={`${colors[plan]} gap-1 text-[10px]`}><CreditCard className="h-2.5 w-2.5" /> {plan.charAt(0).toUpperCase() + plan.slice(1)}</Badge>;
  };

  const getRoleBadge = (role: AppRole) => {
    switch (role) {
      case "admin": return <Badge variant="destructive" className="gap-1"><Crown className="h-3 w-3" /> Admin</Badge>;
      case "moderator": return <Badge className="bg-primary/20 text-primary border-primary/30 gap-1"><Shield className="h-3 w-3" /> Mod</Badge>;
      default: return <Badge variant="secondary">User</Badge>;
    }
  };

  const getBanIcon = (type: string) => {
    switch (type) {
      case "ban": return <Ban className="h-4 w-4 text-destructive" />;
      case "mute": return <VolumeX className="h-4 w-4 text-yellow-400" />;
      case "kick": return <UserX className="h-4 w-4 text-orange-400" />;
      default: return null;
    }
  };

  if (!isModerator) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-7 text-xs">
          <Shield className="h-3.5 w-3.5" /> Admin
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl glass-card rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2 font-bold">
            <Shield className="h-5 w-5 text-primary" /> Admin Panel
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="users" className="mt-4">
          <TabsList className="grid w-full grid-cols-4 bg-background/50">
            <TabsTrigger value="users" className="gap-1 text-xs"><Users className="h-3 w-3" /> Users</TabsTrigger>
            <TabsTrigger value="plans" className="gap-1 text-xs"><CreditCard className="h-3 w-3" /> Plans</TabsTrigger>
            <TabsTrigger value="actions" className="gap-1 text-xs"><Ban className="h-3 w-3" /> Actions</TabsTrigger>
            <TabsTrigger value="bans" className="gap-1 text-xs"><UserX className="h-3 w-3" /> Restrictions</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {users.map((user) => (
                  <motion.div key={user.user_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-3 rounded-lg bg-background/30 border border-border/50">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">{user.display_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{user.display_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground font-jetbrains">{user.user_id.slice(0, 8)}…</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <button onClick={() => toggleUserAI(user.user_id, user.ai_enabled ?? true)}
                          className={`p-1.5 rounded-lg transition-colors ${user.ai_enabled !== false ? "bg-primary/15 text-primary hover:bg-primary/25" : "bg-destructive/15 text-destructive hover:bg-destructive/25"}`}
                          title={user.ai_enabled !== false ? "Disable AI" : "Enable AI"}>
                          <Sparkles className="h-4 w-4" />
                        </button>
                      )}
                      {isAdmin ? (
                        <Select value={user.role} onValueChange={(v) => handleRoleChange(user.user_id, v as AppRole)}>
                          <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="moderator">Moderator</SelectItem>
                            <SelectItem value="user">User</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : getRoleBadge(user.role)}
                    </div>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="plans" className="mt-4">
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {users.map((user) => (
                  <motion.div key={user.user_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-3 rounded-lg bg-background/30 border border-border/50">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">{user.display_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{user.display_name || "Unknown"}</p>
                        {getPlanBadge(user.plan || "free")}
                      </div>
                    </div>
                    {isAdmin && (
                      <Select value={user.plan || "free"} onValueChange={(v) => handlePlanChange(user.user_id, v as PlanType)}>
                        <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="team">Team</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="actions" className="mt-4 space-y-4">
            <div className="space-y-3">
              <div><Label className="text-xs">User</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{users.map(u => <SelectItem key={u.user_id} value={u.user_id}>{u.display_name || u.user_id.slice(0, 8)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Action</Label>
                <Select value={banType} onValueChange={(v) => setBanType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mute"><span className="flex items-center gap-2"><VolumeX className="h-4 w-4" /> Mute</span></SelectItem>
                    <SelectItem value="kick"><span className="flex items-center gap-2"><UserX className="h-4 w-4" /> Kick</span></SelectItem>
                    <SelectItem value="ban"><span className="flex items-center gap-2"><Ban className="h-4 w-4" /> Ban</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Duration</Label>
                <Select value={banDuration} onValueChange={setBanDuration}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 hour</SelectItem>
                    <SelectItem value="24">1 day</SelectItem>
                    <SelectItem value="168">1 week</SelectItem>
                    <SelectItem value="720">1 month</SelectItem>
                    <SelectItem value="forever">Forever</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Reason (optional)</Label>
                <Input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Enter reason..." className="bg-background/50" />
              </div>
              <Button onClick={handleBan} disabled={loading || !selectedUser} className="w-full">
                {loading ? "Processing..." : "Confirm"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="bans" className="mt-4">
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                <AnimatePresence>
                  {bans.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8 text-sm">No active restrictions</p>
                  ) : bans.map((ban) => {
                    const u = users.find(x => x.user_id === ban.user_id);
                    return (
                      <motion.div key={ban.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -100 }}
                        className="flex items-center justify-between p-3 rounded-lg bg-background/30 border border-border/50">
                        <div className="flex items-center gap-3">
                          {getBanIcon(ban.ban_type)}
                          <div>
                            <p className="font-medium text-sm">{u?.display_name || ban.user_id.slice(0, 8)}</p>
                            {ban.reason && <p className="text-xs text-muted-foreground">{ban.reason}</p>}
                            {ban.expires_at && <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(ban.expires_at).toLocaleString()}</p>}
                          </div>
                        </div>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" onClick={() => handleUnban(ban.id)} className="text-destructive hover:text-destructive h-8 w-8">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AdminPanel;
