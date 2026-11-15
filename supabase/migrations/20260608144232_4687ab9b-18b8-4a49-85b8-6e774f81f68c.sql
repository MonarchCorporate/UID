DROP INDEX IF EXISTS public.blueprints_external_uuid_key;
CREATE UNIQUE INDEX IF NOT EXISTS blueprints_external_uuid_uniq ON public.blueprints(external_uuid);
CREATE UNIQUE INDEX IF NOT EXISTS blueprint_missions_bp_mission_uniq ON public.blueprint_missions(blueprint_id, mission_uuid);