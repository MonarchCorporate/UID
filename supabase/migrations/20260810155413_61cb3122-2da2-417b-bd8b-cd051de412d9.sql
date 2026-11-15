DROP POLICY IF EXISTS "members: owner/officer manage" ON public.org_members;

CREATE POLICY "members: owner manage"
ON public.org_members
FOR ALL
TO authenticated
USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role]))
WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner'::org_role]));

-- Officers may add/remove ordinary members only, never owners/officers,
-- never themselves, and never grant permissions or custom roles.
CREATE POLICY "members: officer manage plain members insert"
ON public.org_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_org_role(auth.uid(), org_id, ARRAY['officer'::org_role])
  AND user_id <> auth.uid()
  AND role = 'member'::org_role
  AND coalesce(array_length(permissions, 1), 0) = 0
  AND custom_role_id IS NULL
);

CREATE POLICY "members: officer manage plain members update"
ON public.org_members
FOR UPDATE
TO authenticated
USING (
  public.has_org_role(auth.uid(), org_id, ARRAY['officer'::org_role])
  AND user_id <> auth.uid()
  AND role NOT IN ('owner'::org_role, 'officer'::org_role)
)
WITH CHECK (
  public.has_org_role(auth.uid(), org_id, ARRAY['officer'::org_role])
  AND user_id <> auth.uid()
  AND role = 'member'::org_role
  AND coalesce(array_length(permissions, 1), 0) = 0
  AND custom_role_id IS NULL
);

CREATE POLICY "members: officer manage plain members delete"
ON public.org_members
FOR DELETE
TO authenticated
USING (
  public.has_org_role(auth.uid(), org_id, ARRAY['officer'::org_role])
  AND user_id <> auth.uid()
  AND role NOT IN ('owner'::org_role, 'officer'::org_role)
);

CREATE POLICY "members: officer read"
ON public.org_members
FOR SELECT
TO authenticated
USING (public.is_org_member(auth.uid(), org_id));