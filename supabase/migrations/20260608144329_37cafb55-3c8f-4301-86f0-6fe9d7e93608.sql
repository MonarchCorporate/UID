DROP INDEX IF EXISTS public.blueprints_external_uuid_uniq;
CREATE UNIQUE INDEX blueprints_external_uuid_uniq ON public.blueprints(external_uuid);

DROP INDEX IF EXISTS public.blueprint_missions_bp_mission_uniq;
CREATE UNIQUE INDEX blueprint_missions_bp_mission_uniq ON public.blueprint_missions(blueprint_id, mission_uuid);