-- Create a security definer function to avoid recursion
CREATE OR REPLACE FUNCTION public.is_room_member(_user_id uuid, _room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_members
    WHERE user_id = _user_id
      AND room_id = _room_id
  )
$$;

-- Drop the recursive policy
DROP POLICY IF EXISTS "Members can view room memberships" ON public.room_members;

-- Create non-recursive policy using the function
CREATE POLICY "Members can view room memberships"
ON public.room_members
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR is_room_member(auth.uid(), room_id)
);