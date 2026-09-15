-- In-progress AI / Credyx batch creation (not a carrier-editable draft).
DO $$ BEGIN
  ALTER TYPE batch_status ADD VALUE IF NOT EXISTS 'creating';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
