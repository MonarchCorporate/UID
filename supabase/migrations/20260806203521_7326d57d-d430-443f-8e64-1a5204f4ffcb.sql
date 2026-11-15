CREATE TYPE public.membership_application_status AS ENUM ('open','accepted','rejected');

CREATE TABLE public.membership_application_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  channel_id text,
  channel_name text,
  embed_title text NOT NULL DEFAULT 'Neue Bewerbung',
  embed_color integer NOT NULL DEFAULT 3447003,
  ping_role_id text,
  intro_text text NOT NULL DEFAULT '',
  success_text text NOT NULL DEFAULT 'Danke! Deine Bewerbung wurde übermittelt.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.membership_application_settings TO authenticated;
GRANT ALL ON public.membership_application_settings TO service_role;
ALTER TABLE public.membership_application_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable by authenticated"
  ON public.membership_application_settings FOR SELECT TO authenticated USING (true);
CREATE TRIGGER membership_application_settings_updated
  BEFORE UPDATE ON public.membership_application_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.membership_application_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL UNIQUE,
  label text NOT NULL,
  help text,
  placeholder text,
  field_type text NOT NULL DEFAULT 'text',
  required boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.membership_application_fields TO authenticated;
GRANT ALL ON public.membership_application_fields TO service_role;
ALTER TABLE public.membership_application_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fields readable by authenticated"
  ON public.membership_application_fields FOR SELECT TO authenticated USING (active);
CREATE TRIGGER membership_application_fields_updated
  BEFORE UPDATE ON public.membership_application_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.membership_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_user_id text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.membership_application_status NOT NULL DEFAULT 'open',
  channel_id text,
  message_id text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX membership_applications_user_idx ON public.membership_applications(user_id);
CREATE INDEX membership_applications_status_idx ON public.membership_applications(status);
GRANT SELECT ON public.membership_applications TO authenticated;
GRANT ALL ON public.membership_applications TO service_role;
ALTER TABLE public.membership_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own applications readable"
  ON public.membership_applications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER membership_applications_updated
  BEFORE UPDATE ON public.membership_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.membership_application_settings (singleton, intro_text)
VALUES (true, 'Tritt zuerst unserem Discord bei. Danach kannst du dich hier um eine Mitgliedschaft bewerben.');

INSERT INTO public.membership_application_fields (field_key, label, help, placeholder, field_type, required, sort_order)
VALUES
  ('rsi_handle', 'RSI-Handle', 'Dein Star-Citizen-Handle.', 'z. B. TucanoGaming', 'text', true, 1),
  ('org', 'Aktuelle Organisation (SID)', 'Leer lassen, wenn du keiner Orga angehörst.', 'z. B. IDCP', 'text', false, 2),
  ('motivation', 'Warum möchtest du beitreten?', null, 'Erzähl uns kurz etwas über dich.', 'textarea', true, 3);