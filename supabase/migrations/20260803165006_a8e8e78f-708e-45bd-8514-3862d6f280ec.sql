UPDATE public.user_ships u
SET org_id = m.org_id
FROM (
  SELECT user_id, (array_agg(org_id))[1] AS org_id
  FROM public.org_members
  GROUP BY user_id
  HAVING count(*) = 1
) m
WHERE u.user_id = m.user_id AND u.org_id IS NULL;

UPDATE public.missions ms
SET org_id = m.org_id
FROM (
  SELECT user_id, (array_agg(org_id))[1] AS org_id
  FROM public.org_members
  GROUP BY user_id
  HAVING count(*) = 1
) m
WHERE ms.leader_id = m.user_id AND ms.org_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_user_ship_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_org uuid; v_cnt int;
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT count(*), (array_agg(org_id))[1] INTO v_cnt, v_org
    FROM public.org_members WHERE user_id = NEW.user_id;
    IF v_cnt = 1 THEN NEW.org_id := v_org; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_user_ship_org ON public.user_ships;
CREATE TRIGGER trg_set_user_ship_org
BEFORE INSERT ON public.user_ships
FOR EACH ROW EXECUTE FUNCTION public.set_user_ship_org();