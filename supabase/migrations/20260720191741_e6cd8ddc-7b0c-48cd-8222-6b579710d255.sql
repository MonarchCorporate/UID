
ALTER TABLE public.board_cargo
  ADD COLUMN IF NOT EXISTS item_ref  text,
  ADD COLUMN IF NOT EXISTS item_name text,
  ADD COLUMN IF NOT EXISTS item_kind text,
  ADD COLUMN IF NOT EXISTS quality   integer,
  ADD COLUMN IF NOT EXISTS unit      text NOT NULL DEFAULT 'scu',
  ADD COLUMN IF NOT EXISTS qty       numeric(12,2) NOT NULL DEFAULT 0;

-- Backfill from legacy commodity/scu
UPDATE public.board_cargo
SET item_name = COALESCE(item_name, commodity),
    qty = CASE WHEN qty = 0 AND scu <> 0 THEN scu ELSE qty END
WHERE item_name IS NULL OR (qty = 0 AND scu <> 0);

-- Allow commodity to be nullable now that item_name is canonical
ALTER TABLE public.board_cargo ALTER COLUMN commodity DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'board_cargo_unit_check'
  ) THEN
    ALTER TABLE public.board_cargo
      ADD CONSTRAINT board_cargo_unit_check CHECK (unit IN ('pcs','scu'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'board_cargo_quality_check'
  ) THEN
    ALTER TABLE public.board_cargo
      ADD CONSTRAINT board_cargo_quality_check
      CHECK (quality IS NULL OR (quality >= 0 AND quality <= 1000));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'board_cargo_qty_check'
  ) THEN
    ALTER TABLE public.board_cargo
      ADD CONSTRAINT board_cargo_qty_check CHECK (qty >= 0);
  END IF;
END $$;

ALTER TABLE public.board_members
  ADD COLUMN IF NOT EXISTS can_transfer_cargo boolean NOT NULL DEFAULT false;
