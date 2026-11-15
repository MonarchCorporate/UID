ALTER TABLE public.farm_list_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.farm_list_members
  DROP CONSTRAINT IF EXISTS farm_list_members_status_chk;
ALTER TABLE public.farm_list_members
  ADD CONSTRAINT farm_list_members_status_chk CHECK (status IN ('pending','accepted'));

CREATE OR REPLACE FUNCTION public.can_access_farm_list(_list uuid, _user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.farm_lists WHERE id = _list AND owner_id = _user)
    OR EXISTS (
      SELECT 1 FROM public.farm_list_members
      WHERE list_id = _list AND user_id = _user AND status = 'accepted'
    )
$function$;

CREATE OR REPLACE FUNCTION public.can_edit_farm_list(_list uuid, _user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.farm_lists WHERE id = _list AND owner_id = _user)
    OR EXISTS (
      SELECT 1 FROM public.farm_list_members
      WHERE list_id = _list AND user_id = _user AND role = 'editor' AND status = 'accepted'
    )
$function$;

DROP POLICY IF EXISTS "farm_list_members read own invite" ON public.farm_list_members;
CREATE POLICY "farm_list_members read own invite"
  ON public.farm_list_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "farm_list_members respond own invite" ON public.farm_list_members;
CREATE POLICY "farm_list_members respond own invite"
  ON public.farm_list_members FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "farm_list_members leave" ON public.farm_list_members;
CREATE POLICY "farm_list_members leave"
  ON public.farm_list_members FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());