delete from public.org_members om
where om.role = 'member'
  and exists (select 1 from public.profiles p where p.id = om.user_id and p.discord_user_id is not null)
  and exists (select 1 from public.discord_role_mappings m where m.org_id = om.org_id and m.enabled)
  and om.user_id = 'b2fdb808-8329-4f6a-a061-cf109fa1e18f';