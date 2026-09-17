-- Allow batches to enter Credyx rework when AI packet creation fails.
-- Carriers see "Rework"; admins see detailed job errors + docs + retry.

ALTER TYPE public.batch_status ADD VALUE IF NOT EXISTS 'rework';
