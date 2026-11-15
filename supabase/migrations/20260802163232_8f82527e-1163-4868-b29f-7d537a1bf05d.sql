CREATE TABLE public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_label text,
  org_id uuid references public.orgs(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  summary text,
  metadata jsonb not null default '{}'::jsonb
);
CREATE INDEX audit_log_created_at_idx ON public.audit_log (created_at desc);
CREATE INDEX audit_log_actor_idx ON public.audit_log (actor_user_id);
CREATE INDEX audit_log_org_idx ON public.audit_log (org_id);
CREATE INDEX audit_log_action_idx ON public.audit_log (action);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App admins can read audit log"
ON public.audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));