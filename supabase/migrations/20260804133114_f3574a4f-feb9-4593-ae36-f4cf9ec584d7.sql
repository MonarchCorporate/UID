CREATE TABLE public.discord_category_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  source_category_id text,
  source_category_name text,
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.discord_category_templates TO authenticated;
GRANT ALL ON public.discord_category_templates TO service_role;

ALTER TABLE public.discord_category_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view discord category templates"
ON public.discord_category_templates
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER discord_category_templates_set_updated_at
BEFORE UPDATE ON public.discord_category_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();