import { useParams, useNavigate } from "react-router-dom";
import { useRoom, useFiles, joinRoom } from "@/hooks/useFiles";
import { usePresence } from "@/hooks/usePresence";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import CodeEditorWithAI from "@/components/CodeEditorWithAI";
import FileExplorer from "@/components/FileExplorer";
import EditorTabs from "@/components/EditorTabs";
import EditorHeader from "@/components/EditorHeader";
import EditorWelcome from "@/components/EditorWelcome";
import StatusBar from "@/components/StatusBar";
import Terminal from "@/components/Terminal";
import AdminPanel from "@/components/AdminPanel";
import LivePreview from "@/components/LivePreview";
import WorkspacePanel from "@/components/WorkspacePanel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, PanelLeftClose, PanelLeft, Eye, EyeOff, Bot, BotOff } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { debounce } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";

const Room = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { room, loading: roomLoading, error } = useRoom(id || null);
  const { user, isAuthenticated } = useAuth();
  const {
    files, activeFile, setActiveFile, loading: filesLoading,
    createFile, updateFileContent, deleteFile, renameFile,
  } = useFiles(room?.id || null);
  const { onlineUsers } = usePresence(room?.id || null);
  const { isModerator } = useAdmin();

  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [localContent, setLocalContent] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [activeFile?.id]);

  const checkRoomAccess = useCallback(
    async (roomId: string) => {
      if (!user) return { allowed: false, reason: "not-authenticated" as const };
      const { data: bans } = await supabase
        .from("user_bans").select("ban_type, expires_at")
        .eq("user_id", user.id).or(`room_id.eq.${roomId},room_id.is.null`);
      const now = new Date();
      const isActive = (expiresAt: string | null) => !expiresAt || new Date(expiresAt) > now;
      const hasBan = (bans || []).some((b) => b.ban_type === "ban" && isActive(b.expires_at));
      if (hasBan) return { allowed: false, reason: "banned" as const };
      return { allowed: true, reason: null };
    },
    [user]
  );

  useEffect(() => {
    if (!room?.id || !isAuthenticated || !user) return;
    const enterRoom = async () => {
      const access = await checkRoomAccess(room.id);
      if (!access.allowed) {
        toast({ title: "Access denied", description: access.reason === "banned" ? "You are banned." : "Access denied.", variant: "destructive" });
        navigate("/", { replace: true }); return;
      }
      const result = await joinRoom(room.id);
      if (result?.error) {
        const message = (result.error.message || "").toLowerCase();
        if (message.includes("banned") || message.includes("kicked")) {
          toast({ title: "Access denied", description: result.error.message, variant: "destructive" });
          navigate("/", { replace: true });
        }
      }
    };
    enterRoom();
  }, [room?.id, isAuthenticated, user?.id, checkRoomAccess, navigate, toast]);

  useEffect(() => {
    if (!room?.id || !user?.id) return;
    const channel = supabase.channel(`room-access:${room.id}:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_bans", filter: `user_id=eq.${user.id}` },
        async () => {
          const access = await checkRoomAccess(room.id);
          if (!access.allowed) {
            toast({ title: "Removed from room", description: "You were banned.", variant: "destructive" });
            navigate("/", { replace: true });
          }
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room?.id, user?.id, checkRoomAccess, navigate, toast]);

  useEffect(() => {
    if (!room?.id || !user?.id) return;
    const channel = supabase.channel(`room-membership:${room.id}:${user.id}`)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "room_members", filter: `user_id=eq.${user.id}` },
        (payload) => {
          if ((payload.old as any)?.room_id === room.id) {
            toast({ title: "Removed from room", description: "You were kicked.", variant: "destructive" });
            navigate("/", { replace: true });
          }
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room?.id, user?.id, navigate, toast]);

  useEffect(() => {
    if (activeFile && activeFile.content !== localContent) setLocalContent(activeFile.content);
  }, [activeFile?.content]);

  const handleFileSelect = (file: typeof activeFile) => {
    if (!file || file.is_folder) return;
    setActiveFile(file);
    setLocalContent(file.content);
    if (!openTabs.includes(file.id)) setOpenTabs(prev => [...prev, file.id]);
  };

  const debouncedSave = useCallback(
    debounce((fileId: string, content: string) => { updateFileContent(fileId, content); }, 500),
    [updateFileContent]
  );

  const handleCodeChange = (newContent: string) => {
    setLocalContent(newContent);
    if (activeFile) debouncedSave(activeFile.id, newContent);
  };

  const handleTabClose = (tabId: string) => {
    setOpenTabs(prev => prev.filter(id => id !== tabId));
    if (activeFile?.id === tabId) {
      const remaining = openTabs.filter(id => id !== tabId);
      if (remaining.length > 0) {
        const nextFile = files.find(f => f.id === remaining[remaining.length - 1]);
        if (nextFile) { setActiveFile(nextFile); setLocalContent(nextFile.content); }
      } else { setActiveFile(null); }
    }
  };

  const handleTabSelect = (tabId: string) => {
    const file = files.find(f => f.id === tabId);
    if (file) { setActiveFile(file); setLocalContent(file.content); }
  };

  const handleCreateFile = async (name: string, path: string, isFolder: boolean, language?: string) => {
    const newFile = await createFile(name, path, isFolder, language);
    if (newFile && !isFolder) handleFileSelect(newFile);
  };

  const loading = roomLoading || filesLoading;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading room...</p>
        </div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-2">Room not found</h1>
          <p className="text-sm text-muted-foreground mb-4">This room does not exist or was deleted</p>
          <Button onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4 mr-1.5" /> Back to home</Button>
        </div>
      </div>
    );
  }

  const openTabFiles = files.filter(f => openTabs.includes(f.id));

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center h-10 bg-card border-b border-border flex-shrink-0">
        <button onClick={() => navigate("/")} className="h-10 w-10 flex items-center justify-center hover:bg-secondary transition-colors duration-150 border-r border-border">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="h-10 w-10 flex items-center justify-center hover:bg-secondary transition-colors duration-150 border-r border-border">
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4 text-muted-foreground" /> : <PanelLeft className="h-4 w-4 text-muted-foreground" />}
        </button>
        {isModerator && (
          <div className="flex items-center border-r border-border px-1.5">
            <AdminPanel roomId={id} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <EditorHeader
            roomId={room.id} roomName={room.name} activeFileName={activeFile?.name}
            onlineUsers={onlineUsers} files={files}
            onFilesImported={async (importedFiles) => {
              const folderPaths = new Set<string>();
              for (const file of importedFiles) {
                const parts = file.path.split("/").filter(Boolean);
                let currentPath = "/";
                for (const part of parts) {
                  folderPaths.add(JSON.stringify({ name: part, path: currentPath }));
                  currentPath += part + "/";
                }
              }
              for (const folderJson of folderPaths) {
                const { name, path } = JSON.parse(folderJson);
                if (!files.some(f => f.is_folder && f.name === name && f.path === path)) await createFile(name, path, true);
              }
              for (const file of importedFiles) await createFile(file.name, file.path, false, file.language, file.content);
            }}
          />
        </div>
        {/* Preview toggle */}
        <button
          onClick={() => setPreviewOpen(!previewOpen)}
          className={`h-10 w-10 flex items-center justify-center hover:bg-secondary transition-colors duration-150 border-l border-border ${previewOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
          title={previewOpen ? "Close preview" : "Live preview"}
        >
          {previewOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        {/* Panel toggle */}
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className={`h-10 w-10 flex items-center justify-center hover:bg-secondary transition-colors duration-150 border-l border-border ${panelOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
          title={panelOpen ? "Close AI panel" : "Open AI panel"}
        >
          {panelOpen ? <BotOff className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile sidebar overlay */}
        {isMobile && sidebarOpen && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm z-20" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <div
          className={`${isMobile ? 'absolute z-30 h-full' : 'relative'} overflow-hidden transition-all duration-150 ease-out`}
          style={{ width: sidebarOpen ? (isMobile ? '260px' : '240px') : '0px' }}
        >
          <div className={`${isMobile ? 'w-[260px]' : 'w-[240px]'} h-full`}>
            <FileExplorer
              files={files} activeFileId={activeFile?.id || null} onFileSelect={handleFileSelect}
              onCreateFile={handleCreateFile} onDeleteFile={deleteFile} onRenameFile={renameFile}
            />
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <EditorTabs
            tabs={openTabFiles.map(f => ({ id: f.id, name: f.name, language: f.language }))}
            activeTabId={activeFile?.id || null} onTabSelect={handleTabSelect} onTabClose={handleTabClose}
          />
          <div className="flex-1 overflow-hidden">
            {activeFile ? (
              <CodeEditorWithAI code={localContent} language={activeFile.language} onChange={handleCodeChange} files={files} />
            ) : (
              <EditorWelcome />
            )}
          </div>
          <Terminal isOpen={terminalOpen} onToggle={() => setTerminalOpen(!terminalOpen)} code={localContent} language={activeFile?.language || "javascript"} files={files} activeFile={activeFile} />
          <StatusBar language={activeFile?.language || "plaintext"} fileName={activeFile?.name} />
        </div>

        {/* Live Preview */}
        {previewOpen && (
          <div className="w-[40%] h-full border-l border-border">
            <LivePreview files={files} activeFile={activeFile} isOpen={previewOpen} onToggle={() => setPreviewOpen(false)} />
          </div>
        )}

        {/* Workspace Panel (BuildForge AI / CodeForge AI / Team Chat) */}
        {panelOpen && (
          <div className="w-[380px] h-full flex-shrink-0">
            <WorkspacePanel
              isOpen={panelOpen}
              onToggle={() => setPanelOpen(!panelOpen)}
              roomId={id || ""}
              code={localContent}
              language={activeFile?.language || "javascript"}
              files={files}
              activeFile={activeFile}
              onCreateFile={async (name, path, isFolder, language, content) => await createFile(name, path, isFolder, language, content)}
              onUpdateFileContent={(fileId, content) => { updateFileContent(fileId, content); setLocalContent(content); }}
              projectName={room.name}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Room;
