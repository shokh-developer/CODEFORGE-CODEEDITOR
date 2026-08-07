import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FileItem {
  id: string;
  room_id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  is_folder: boolean;
  created_at: string;
  updated_at: string;
}

interface Room {
  id: string;
  name: string;
  code: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export const useFiles = (roomId: string | null) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeFile, setActiveFile] = useState<FileItem | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  // Track IDs of files we inserted locally so their realtime INSERT events are ignored.
  // A boolean flag only suppresses the FIRST event; a Set handles batch inserts of N files.
  const localInsertIds = useRef<Set<string>>(new Set());
  // Per-file suppression window: we ignore realtime UPDATE echoes for files we
  // just wrote ourselves. A single boolean used to let our own echo overwrite the
  // editor mid-typing, which is what made typing feel frozen for seconds.
  const localUpdateAt = useRef<Map<string, number>>(new Map());
  const markLocalUpdate = (id: string) => localUpdateAt.current.set(id, Date.now());
  const isEchoOfLocalUpdate = (id: string) => {
    const ts = localUpdateAt.current.get(id);
    return ts !== undefined && Date.now() - ts < 8000;
  };

  // Fetch files
  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    const fetchFiles = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("files")
        .select("*")
        .eq("room_id", roomId)
        .order("is_folder", { ascending: false })
        .order("name");

      if (error) {
        toast({
          title: "Xatolik",
          description: "Fayllarni yuklashda xatolik",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // If no files, create default file
      if (!data || data.length === 0) {
        const defaultFile = await createFile(roomId, "main.js", "/", false, "javascript", '// Welcome to MangaCode!\nconsole.log("Hello, World!");');
        if (defaultFile) {
          setFiles([defaultFile]);
          setActiveFile(defaultFile);
        }
      } else {
        setFiles(data);
        // Set first non-folder file as active
        const firstFile = data.find(f => !f.is_folder);
        if (firstFile) setActiveFile(firstFile);
      }

      setLoading(false);
    };

    fetchFiles();
  }, [roomId]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`files-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "files",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const id = (payload.new as FileItem).id;
            if (localInsertIds.current.has(id)) {
              // We already added this file to state locally — skip to avoid duplicate
              localInsertIds.current.delete(id);
              return;
            }
            setFiles(prev => [...prev, payload.new as FileItem]);
          } else if (payload.eventType === "UPDATE") {
            if (isEchoOfLocalUpdate((payload.new as FileItem).id)) return;
            setFiles(prev => prev.map(f => f.id === payload.new.id ? payload.new as FileItem : f));
            setActiveFile(prev => prev?.id === payload.new.id ? payload.new as FileItem : prev);
          } else if (payload.eventType === "DELETE") {
            setFiles(prev => prev.filter(f => f.id !== payload.old.id));
            setActiveFile(prev => prev?.id === payload.old.id ? null : prev);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // Create a single file
  const createFile = async (
    roomId: string,
    name: string,
    path: string,
    isFolder: boolean,
    language: string = "javascript",
    content: string = ""
  ): Promise<FileItem | null> => {
    if (!name.trim()) return null;

    const { data, error } = await supabase
      .from("files")
      .insert([{ room_id: roomId, name, path, is_folder: isFolder, language, content }])
      .select()
      .single();

    if (error) {
      toast({
        title: "Xatolik",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }

    localInsertIds.current.add(data.id);
    setFiles(prev => [...prev, data]);
    return data;
  };

  // Batch-create multiple files atomically; auto-creates missing parent folders first.
  // If a file with the same path+name already exists in this room, UPDATE it instead of duplicating.
  const batchCreateFiles = async (
    roomId: string,
    entries: Array<{ name: string; path: string; isFolder: boolean; language?: string; content?: string }>
  ): Promise<{ created: FileItem[]; failedNames: string[] }> => {
    if (entries.length === 0) return { created: [], failedNames: [] };

    // Deduplicate within the batch (keep last occurrence when AI repeats paths)
    const seen = new Map<string, typeof entries[0]>();
    for (const e of entries) {
      seen.set(`${e.path}||${e.name}`, e);
    }
    const unique = Array.from(seen.values());

    // Build a lookup of files that already exist in this room (by path+name key)
    const existingFileMap = new Map(
      files.filter(f => !f.is_folder).map(f => [`${f.path}||${f.name}`, f])
    );

    // Auto-ensure every parent folder exists before inserting files
    const existingKeys = new Set(files.map(f => `${f.path}||${f.name}`));
    const foldersToCreate: Array<{ name: string; path: string }> = [];
    for (const e of unique) {
      const segments = e.path.replace(/^\/|\/$/g, "").split("/").filter(Boolean);
      let cur = "/";
      for (const seg of segments) {
        const key = `${cur}||${seg}`;
        if (!existingKeys.has(key)) {
          foldersToCreate.push({ name: seg, path: cur });
          existingKeys.add(key);
        }
        cur = cur === "/" ? `/${seg}/` : `${cur}${seg}/`;
      }
    }

    // Insert missing parent folders one-by-one (ignore duplicates gracefully).
    // CRITICAL: add each folder to local state immediately so FileExplorer can render the tree
    // without waiting for a Supabase realtime event (which we suppress via localInsertIds anyway).
    for (const f of foldersToCreate) {
      const { data: folderData } = await supabase
        .from("files")
        .insert([{ room_id: roomId, name: f.name, path: f.path, is_folder: true, language: "plaintext", content: "" }])
        .select()
        .maybeSingle();
      if (folderData) {
        localInsertIds.current.add((folderData as FileItem).id);
        setFiles(prev =>
          prev.some(f => f.id === (folderData as FileItem).id)
            ? prev
            : [...prev, folderData as FileItem]
        );
      }
    }

    const nonFolderEntries = unique.filter(e => !e.isFolder && e.name.trim());

    // Split: files that already exist in DB → UPDATE; files that don't → INSERT
    const toUpdate = nonFolderEntries.filter(e => existingFileMap.has(`${e.path}||${e.name}`));
    const toInsert = nonFolderEntries.filter(e => !existingFileMap.has(`${e.path}||${e.name}`));

    // UPDATE existing files in parallel
    const updatedFiles: FileItem[] = [];
    await Promise.all(toUpdate.map(async (e) => {
      const existing = existingFileMap.get(`${e.path}||${e.name}`)!;
      markLocalUpdate(existing.id);
      const { data: updated } = await supabase
        .from("files")
        .update({ content: e.content ?? "", language: e.language || existing.language })
        .eq("id", existing.id)
        .select()
        .single();
      if (updated) {
        updatedFiles.push(updated as FileItem);
        setFiles(prev => prev.map(f => f.id === existing.id ? (updated as FileItem) : f));
      }
    }));

    // INSERT new files in one round-trip
    const insertedFiles: FileItem[] = [];
    const failedNames: string[] = [];

    if (toInsert.length > 0) {
      const rows = toInsert.map(e => ({
        room_id: roomId,
        name: e.name.trim(),
        path: e.path || "/",
        is_folder: false,
        language: e.language || "plaintext",
        content: e.content ?? "",
      }));

      const { data, error } = await supabase
        .from("files")
        .insert(rows)
        .select();

      if (error) {
        toast({ title: "Xatolik", description: error.message, variant: "destructive" });
        failedNames.push(...rows.map(r => r.name));
      } else {
        const created = (data || []) as FileItem[];
        created.forEach(f => localInsertIds.current.add(f.id));
        setFiles(prev => [...prev, ...created]);
        insertedFiles.push(...created);

        const createdKeys = new Set(created.map(f => `${f.path}||${f.name}`));
        rows.filter(r => !createdKeys.has(`${r.path}||${r.name}`)).forEach(r => failedNames.push(r.name));
      }
    }

    return {
      created: [...insertedFiles, ...updatedFiles],
      failedNames,
    };
  };

  // Re-fetch all files from DB — safety net after bulk operations
  const refreshFiles = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase
      .from("files")
      .select("*")
      .eq("room_id", roomId)
      .order("is_folder", { ascending: false })
      .order("name");
    if (data) setFiles(data);
  }, [roomId]);

  // Update file content
  const updateFileContent = useCallback(
    async (fileId: string, newContent: string) => {
      markLocalUpdate(fileId);

      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, content: newContent } : f));
      setActiveFile(prev => prev?.id === fileId ? { ...prev, content: newContent } : prev);

      const { error } = await supabase
        .from("files")
        .update({ content: newContent })
        .eq("id", fileId);

      if (error) {
        toast({
          title: "Xatolik",
          description: "Faylni saqlashda xatolik",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  // Delete file
  const deleteFile = async (fileId: string) => {
    markLocalUpdate(fileId);

    const { error } = await supabase
      .from("files")
      .delete()
      .eq("id", fileId);

    if (error) {
      toast({
        title: "Xatolik",
        description: "Faylni o'chirishda xatolik",
        variant: "destructive",
      });
      return;
    }

    setFiles(prev => prev.filter(f => f.id !== fileId));
    if (activeFile?.id === fileId) {
      const remaining = files.filter(f => f.id !== fileId && !f.is_folder);
      setActiveFile(remaining[0] || null);
    }
  };

  // Rename file
  const renameFile = async (fileId: string, newName: string) => {
    markLocalUpdate(fileId);

    const { error } = await supabase
      .from("files")
      .update({ name: newName })
      .eq("id", fileId);

    if (error) {
      toast({
        title: "Xatolik",
        description: "Fayl nomini o'zgartirishda xatolik",
        variant: "destructive",
      });
      return;
    }

    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, name: newName } : f));
  };

  return {
    files,
    activeFile,
    setActiveFile,
    loading,
    createFile: (name: string, path: string, isFolder: boolean, language?: string, content?: string) =>
      roomId ? createFile(roomId, name, path, isFolder, language, content) : Promise.resolve(null),
    batchCreateFiles: (
      entries: Array<{ name: string; path: string; isFolder: boolean; language?: string; content?: string }>
    ) =>
      roomId
        ? batchCreateFiles(roomId, entries)
        : Promise.resolve({ created: [], failedNames: [] }),
    updateFileContent,
    refreshFiles,
    deleteFile,
    renameFile,
  };
};

export const useRoom = (roomIdOrName: string | null) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomIdOrName) {
      setLoading(false);
      return;
    }

    const fetchRoom = async () => {
      // Check if it's a valid UUID format
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomIdOrName);
      
      let data = null;
      let fetchError = null;

      if (isUUID) {
        // Search by ID first
        const result = await supabase
          .from("rooms")
          .select("*")
          .eq("id", roomIdOrName)
          .single();
        data = result.data;
        fetchError = result.error;
      }
      
      // If not UUID or not found by ID, search by name
      if (!data) {
        const result = await supabase
          .from("rooms")
          .select("*")
          .eq("name", roomIdOrName)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        data = result.data;
        fetchError = result.error;
      }

      if (fetchError || !data) {
        setError("Xona topilmadi");
        setLoading(false);
        return;
      }

      setRoom(data);
      setLoading(false);
    };

    fetchRoom();
  }, [roomIdOrName]);

  return { room, loading, error };
};

export const createRoom = async (name: string) => {
  console.log("Creating room with name:", name);
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("You must be signed in to create a room");
  }

  const { data: globalBans } = await supabase
    .from("user_bans")
    .select("expires_at")
    .eq("user_id", user.id)
    .eq("ban_type", "ban")
    .is("room_id", null);

  const now = new Date();
  const isGloballyBanned = (globalBans || []).some(
    (ban) => !ban.expires_at || new Date(ban.expires_at) > now
  );

  if (isGloballyBanned) {
    throw new Error("You are banned and cannot create rooms");
  }
  
  const { data, error } = await supabase
    .from("rooms")
    .insert([{ 
      name, 
      code: "", 
      language: "javascript",
      created_by: user?.id || null 
    }])
    .select()
    .single();

  if (error) {
    console.error("Supabase room creation error:", error);
    if (error.message?.toLowerCase().includes("row-level security")) {
      throw new Error("You are not allowed to create a room");
    }
    throw new Error(error.message || "Failed to create room");
  }
  
  console.log("Room created successfully:", data);
  return data;
};

// Join room as member
export const joinRoom = async (roomId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error("Not authenticated") };

  const { data: bans } = await supabase
    .from("user_bans")
    .select("ban_type, expires_at, room_id")
    .eq("user_id", user.id)
    .or(`room_id.eq.${roomId},room_id.is.null`);

  const now = new Date();
  const isActive = (expiresAt: string | null) =>
    !expiresAt || new Date(expiresAt) > now;

  const hasBan = (bans || []).some((b) => b.ban_type === "ban" && isActive(b.expires_at));
  if (hasBan) {
    return { data: null, error: new Error("You are banned and cannot enter this room") };
  }

  const { data, error } = await supabase
    .from("room_members")
    .upsert([{ room_id: roomId, user_id: user.id }], { onConflict: "room_id,user_id" })
    .select()
    .single();

  if (error) {
    console.error("Error joining room:", error);
    if (error.message?.toLowerCase().includes("row-level security")) {
      // Membership row is not critical for entering the editor; skip silently.
      return { data: null, error: null };
    }
    return { data: null, error };
  }
  
  return { data, error: null };
};
