
CREATE TABLE public.notification_role_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  role_key text NOT NULL,
  kind text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, role_key, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_role_settings TO authenticated;
GRANT ALL ON public.notification_role_settings TO service_role;

ALTER TABLE public.notification_role_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read role notification settings"
  ON public.notification_role_settings FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "org member managers can insert role notification settings"
  ON public.notification_role_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_org_perm(auth.uid(), org_id, 'members.manage'));

CREATE POLICY "org member managers can update role notification settings"
  ON public.notification_role_settings FOR UPDATE
  TO authenticated
  USING (public.has_org_perm(auth.uid(), org_id, 'members.manage'))
  WITH CHECK (public.has_org_perm(auth.uid(), org_id, 'members.manage'));

CREATE POLICY "org member managers can delete role notification settings"
  ON public.notification_role_settings FOR DELETE
  TO authenticated
  USING (public.has_org_perm(auth.uid(), org_id, 'members.manage'));

CREATE TRIGGER set_notification_role_settings_updated_at
  BEFORE UPDATE ON public.notification_role_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
