-- ============================================================
-- 1. ROOMS: restrict INSERT/UPDATE
-- ============================================================
DROP POLICY IF EXISTS "Anyone can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can update rooms" ON public.rooms;

CREATE POLICY "Authenticated users can create rooms"
  ON public.rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners, members, and admins can update rooms"
  ON public.rooms
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.is_room_member(auth.uid(), id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ============================================================
-- 2. FILES: restrict INSERT/UPDATE/DELETE to room owners/members/admins
-- ============================================================
DROP POLICY IF EXISTS "Anyone can create files" ON public.files;
DROP POLICY IF EXISTS "Anyone can update files" ON public.files;
DROP POLICY IF EXISTS "Anyone can delete files" ON public.files;

CREATE POLICY "Room participants can create files"
  ON public.files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_room_member(auth.uid(), room_id)
    OR EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = files.room_id AND r.created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Room participants can update files"
  ON public.files
  FOR UPDATE
  TO authenticated
  USING (
    public.is_room_member(auth.uid(), room_id)
    OR EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = files.room_id AND r.created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Room participants can delete files"
  ON public.files
  FOR DELETE
  TO authenticated
  USING (
    public.is_room_member(auth.uid(), room_id)
    OR EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = files.room_id AND r.created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ============================================================
-- 3. USER_BANS: restrict SELECT (sensitive reasons)
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view bans" ON public.user_bans;

CREATE POLICY "Admins, moderators and target users can view bans"
  ON public.user_bans
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR auth.uid() = user_id
  );

-- ============================================================
-- 4. SECURITY DEFINER functions: add input validation
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _role IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_room_member(_user_id uuid, _room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _room_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.room_members
    WHERE user_id = _user_id AND room_id = _room_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id uuid, _room_id uuid, _ban_type text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  IF _ban_type IS NULL OR _ban_type NOT IN ('ban', 'kick', 'mute') THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_bans
    WHERE user_id = _user_id
      AND (room_id = _room_id OR room_id IS NULL)
      AND ban_type = _ban_type
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;