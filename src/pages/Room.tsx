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
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { ArrowLeft, Loader2, PanelLeftClose, PanelLeft, Eye, EyeOff, Bot, BotOff } from "lucide-react";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { debounce } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Resize handle: vertical divider (col-resize) ───────────────────────────
const HHandle = () => (
  <PanelResizeHandle className="group relative w-[4px] flex-shrink-0 bg-border/50 hover:bg-primary/50 transition-colors duration-150 cursor-col-resize z-10">
    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] flex items-center justify-center pointer-events-none">
      <div className="h-8 w-[2px] rounded-full bg-muted-foreground/20 group-hover:bg-primary/60 transition-colors duration-150" />
    </div>
  </PanelResizeHandle>
);

// ── Resize handle: horizontal divider (row-resize) ─────────────────────────
const VHandle = () => (
  <PanelResizeHandle className="group relative h-[4px] flex-shrink-0 bg-border/50 hover:bg-primary/50 transition-colors duration-150 cursor-row-resize z-10">
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] flex items-center justify-center pointer-events-none">
      <div className="w-8 h-[2px] rounded-full bg-muted-foreground/20 group-hover:bg-primary/60 transition-colors duration-150" />
    </div>
  </PanelResizeHandle>
);

const Room = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { room, loading: roomLoading, error } = useRoom(id || null);
  const { user, isAuthenticated } = useAuth();
  const {
    files, activeFile, setActiveFile, loading: filesLoading,
    createFile, batchCreateFiles, updateFileContent, refreshFiles, deleteFile, renameFile,
  } = useFiles(room?.id || null);
  const { onlineUsers } = usePresence(room?.id || null);
  const { isModerator } = useAdmin();

  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [localContent, setLocalContent] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // Ref for programmatic collapse/expand of the sidebar Panel on desktop
  const sidebarRef = useRef<ImperativePanelHandle>(null);

  // Toggle sidebar: on mobile use state directly; on desktop use the Panel API
  const handleSidebarToggle = () => {
    if (isMobile) {
      setSidebarOpen(prev => !prev);
      return;
    }
    if (sidebarOpen) {
      sidebarRef.current?.collapse();
    } else {
      sidebarRef.current?.expand();
    }
  };

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [activeFile?.id, isMobile]);

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
  }, [room?.id, isAuthenticated, user, checkRoomAccess, navigate, toast]);

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

  // Only reload editor content when a DIFFERENT file becomes active.
  // (Depending on the whole object reset the buffer after every autosave,
  // which jumped the cursor and made typing feel laggy.)
  const loadedFileIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeFile && loadedFileIdRef.current !== activeFile.id) {
      loadedFileIdRef.current = activeFile.id;
      setLocalContent(activeFile.content);
    }
  }, [activeFile?.id, activeFile]);

  const handleFileSelect = (file: typeof activeFile) => {
    if (!file || file.is_folder) return;
    setActiveFile(file);
    loadedFileIdRef.current = file.id;
    setLocalContent(file.content);
    if (!openTabs.includes(file.id)) setOpenTabs(prev => [...prev, file.id]);
  };

  const lastSavedRef = useRef<Record<string, string>>({});
  const debouncedSave = useMemo(
    () => debounce((fileId: string, content: string) => {
      if (lastSavedRef.current[fileId] === content) return;
      lastSavedRef.current[fileId] = content;
      updateFileContent(fileId, content);
    }, 900),
    [updateFileContent]
  );

  const handleCodeChange = useCallback((newContent: string) => {
    setLocalContent(newContent);
    const id = activeFile?.id;
    if (id) debouncedSave(id, newContent);
  }, [activeFile?.id, debouncedSave]);


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
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center h-8 bg-card border-b border-border flex-shrink-0">
        <button
          onClick={() => navigate("/")}
          className="h-8 w-8 flex items-center justify-center hover:bg-secondary transition-colors duration-150 border-r border-border"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={handleSidebarToggle}
          className="h-8 w-8 flex items-center justify-center hover:bg-secondary transition-colors duration-150 border-r border-border"
        >
          {sidebarOpen ? <PanelLeftClose className="h-3.5 w-3.5 text-muted-foreground" /> : <PanelLeft className="h-3.5 w-3.5 text-muted-foreground" />}
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
        <button
          onClick={() => setPreviewOpen(!previewOpen)}
          className={`h-8 w-8 flex items-center justify-center hover:bg-secondary transition-colors duration-150 border-l border-border ${previewOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
          title={previewOpen ? "Close preview" : "Live preview"}
        >
          {previewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className={`h-8 w-8 flex items-center justify-center hover:bg-secondary transition-colors duration-150 border-l border-border ${panelOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
          title={panelOpen ? "Close AI panel" : "Open AI panel"}
        >
          {panelOpen ? <BotOff className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">

        {/* Mobile: sidebar as absolute overlay (outside PanelGroup) */}
        {isMobile && sidebarOpen && (
          <>
            <div
              className="absolute inset-0 bg-background/60 backdrop-blur-sm z-20"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-[260px] z-30">
              <FileExplorer
                files={files} activeFileId={activeFile?.id || null} onFileSelect={handleFileSelect}
                onCreateFile={handleCreateFile} onDeleteFile={deleteFile} onRenameFile={renameFile}
              />
            </div>
          </>
        )}

        {/* ── Horizontal PanelGroup: sidebar | editor | preview | AI ──────── */}
        <PanelGroup direction="horizontal" className="h-full">

          {/* ① SIDEBAR — desktop only, collapsible */}
          {!isMobile && (
            <Panel
              ref={sidebarRef}
              collapsible
              collapsedSize={0}
              defaultSize={18}
              minSize={10}
              maxSize={35}
              onCollapse={() => setSidebarOpen(false)}
              onExpand={() => setSidebarOpen(true)}
              className="overflow-hidden"
            >
              <FileExplorer
                files={files} activeFileId={activeFile?.id || null} onFileSelect={handleFileSelect}
                onCreateFile={handleCreateFile} onDeleteFile={deleteFile} onRenameFile={renameFile}
              />
            </Panel>
          )}
          {!isMobile && <HHandle />}

          {/* ② CENTER — editor area + terminal (vertical split) */}
          <Panel minSize={20} className="overflow-hidden">
            <div className="h-full flex flex-col">
              {/* Tabs bar — fixed height, outside inner PanelGroup */}
              <EditorTabs
                tabs={openTabFiles.map(f => ({ id: f.id, name: f.name, language: f.language }))}
                activeTabId={activeFile?.id || null} onTabSelect={handleTabSelect} onTabClose={handleTabClose}
              />

              {/* Vertical split when terminal is open */}
              {terminalOpen ? (
                <PanelGroup direction="vertical" className="flex-1 min-h-0">
                  {/* Editor */}
                  <Panel minSize={20} className="overflow-hidden">
                    {activeFile ? (
                      <CodeEditorWithAI
                        code={localContent} language={activeFile.language}
                        onChange={handleCodeChange} files={files}
                      />
                    ) : (
                      <EditorWelcome />
                    )}
                  </Panel>

                  <VHandle />

                  {/* Terminal (resizable) */}
                  <Panel defaultSize={25} minSize={8} maxSize={55} className="overflow-hidden">
                    <Terminal
                      isOpen={true}
                      onToggle={() => setTerminalOpen(false)}
                      code={localContent}
                      language={activeFile?.language || "javascript"}
                      files={files}
                      activeFile={activeFile}
                    />
                  </Panel>
                </PanelGroup>
              ) : (
                /* Terminal collapsed — normal flex column */
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  <div className="flex-1 overflow-hidden">
                    {activeFile ? (
                      <CodeEditorWithAI
                        code={localContent} language={activeFile.language}
                        onChange={handleCodeChange} files={files}
                      />
                    ) : (
                      <EditorWelcome />
                    )}
                  </div>
                  <Terminal
                    isOpen={false}
                    onToggle={() => setTerminalOpen(true)}
                    code={localContent}
                    language={activeFile?.language || "javascript"}
                    files={files}
                    activeFile={activeFile}
                  />
                </div>
              )}

              {/* Status bar — fixed height, outside inner PanelGroup */}
              <StatusBar language={activeFile?.language || "plaintext"} fileName={activeFile?.name} />
            </div>
          </Panel>

          {/* ③ LIVE PREVIEW — shown when previewOpen */}
          {previewOpen && (
            <>
              <HHandle />
              <Panel defaultSize={38} minSize={20} maxSize={65} className="overflow-hidden">
                <LivePreview
                  files={files} activeFile={activeFile}
                  isOpen={previewOpen} onToggle={() => setPreviewOpen(false)}
                />
              </Panel>
            </>
          )}

          {/* ④ AI PANEL — shown when panelOpen */}
          {panelOpen && (
            <>
              <HHandle />
              <Panel defaultSize={28} minSize={18} maxSize={50} className="overflow-hidden bg-card">
                <WorkspacePanel
                  isOpen={panelOpen}
                  onToggle={() => setPanelOpen(!panelOpen)}
                  roomId={id || ""}
                  code={localContent}
                  language={activeFile?.language || "javascript"}
                  files={files}
                  activeFile={activeFile}
                  onCreateFile={async (name, path, isFolder, language, content) =>
                    await createFile(name, path, isFolder, language, content)
                  }
                  onBatchCreateFiles={batchCreateFiles}
                  onRefreshFiles={refreshFiles}
                  onUpdateFileContent={(fileId, content) => {
                    updateFileContent(fileId, content);
                    if (activeFile?.id === fileId) {
                      setLocalContent(content);
                    } else {
                      const edited = files.find(f => f.id === fileId);
                      if (edited && !edited.is_folder) {
                        setActiveFile({ ...edited, content });
                        setLocalContent(content);
                        setOpenTabs(prev => prev.includes(fileId) ? prev : [...prev, fileId]);
                      }
                    }
                  }}
                  projectName={room.name}
                />
              </Panel>
            </>
          )}

        </PanelGroup>
      </div>
    </div>
  );
};

export default Room;
