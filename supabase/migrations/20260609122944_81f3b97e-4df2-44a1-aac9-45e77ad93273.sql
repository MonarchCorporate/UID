
-- 1) Identify keepers per duplicate group
CREATE TEMP TABLE _comp_keepers ON COMMIT DROP AS
WITH groups AS (
  SELECT
    item_ref,
    created_at,
    lower(name) AS k_name,
    COALESCE(classification,'') AS k_class,
    COALESCE(size, 0) AS k_size,
    COALESCE(manufacturer_code,'') AS k_mfr,
    COALESCE(type,'') AS k_type,
    COALESCE(sub_type,'') AS k_sub,
    ROW_NUMBER() OVER (
      PARTITION BY lower(name), COALESCE(classification,''), COALESCE(size,0),
                   COALESCE(manufacturer_code,''), COALESCE(type,''), COALESCE(sub_type,'')
      ORDER BY created_at ASC, item_ref ASC
    ) AS rn
  FROM public.ship_components_catalog
)
SELECT * FROM groups;

-- Map every item_ref to its group's keeper item_ref
CREATE TEMP TABLE _comp_remap ON COMMIT DROP AS
SELECT
  loser.item_ref AS from_ref,
  keeper.item_ref AS to_ref
FROM _comp_keepers loser
JOIN _comp_keepers keeper
  ON keeper.k_name = loser.k_name
 AND keeper.k_class = loser.k_class
 AND keeper.k_size = loser.k_size
 AND keeper.k_mfr = loser.k_mfr
 AND keeper.k_type = loser.k_type
 AND keeper.k_sub = loser.k_sub
 AND keeper.rn = 1
WHERE loser.rn > 1;

-- 2) Remap references in dependent tables
UPDATE public.blueprint_components bc
SET item_ref = r.to_ref
FROM _comp_remap r
WHERE bc.item_ref = r.from_ref;

UPDATE public.inventory_items ii
SET item_ref = r.to_ref
FROM _comp_remap r
WHERE ii.item_ref = r.from_ref;

-- 3) Delete duplicate catalog rows
DELETE FROM public.ship_components_catalog c
USING _comp_remap r
WHERE c.item_ref = r.from_ref;

-- 4) Prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS ship_components_dedupe_uidx
  ON public.ship_components_catalog (
    lower(name),
    COALESCE(classification,''),
    COALESCE(size, 0),
    COALESCE(manufacturer_code,''),
    COALESCE(type,''),
    COALESCE(sub_type,'')
  );
