-- Doc Splitter is a first-class batch status before Packet Rework.
-- Combined PDFs (RC+BOL+invoice) wait here until Credyx splits them.

ALTER TYPE public.batch_status ADD VALUE IF NOT EXISTS 'needs_split';
ALTER TYPE public.sort_status ADD VALUE IF NOT EXISTS 'needs_split';

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS needs_doc_split boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.batches.needs_doc_split IS
  'True while combined PDFs must be split in Doc Splitter before Packet Rework.';
