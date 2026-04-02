DROP POLICY IF EXISTS "Users can view their own memberships" ON public.room_members;
CREATE POLICY "Members can view room memberships"
ON public.room_members
FOR SELECT
TO authenticated
USING (
  room_id IN (SELECT rm.room_id FROM public.room_members rm WHERE rm.user_id = auth.uid())
  OR auth.uid() = user_id
);
DROP POLICY IF EXISTS "Users can leave rooms" ON public.room_members;
CREATE POLICY "Users can leave rooms"
ON public.room_members
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);