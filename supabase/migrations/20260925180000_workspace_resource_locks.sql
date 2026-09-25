-- Human workspace locks for batches + invoices (realtime presence / in-use).
-- AI Doc Split continues to use in_use / in_use_by with in_use_by_user_id = null.

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS in_use_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS in_use_at timestamptz;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS in_use boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_use_by text,
  ADD COLUMN IF NOT EXISTS in_use_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS in_use_at timestamptz;

COMMENT ON COLUMN public.batches.in_use_by_user_id IS
  'Auth user id when a staff member holds the batch workspace lock; null for AI Doc Split.';
COMMENT ON COLUMN public.batches.in_use_at IS
  'Last acquire/heartbeat time for the batch lock (stale reclaim).';
COMMENT ON COLUMN public.invoices.in_use IS
  'True while a staff member has the invoice open in Admin Invoice Workspace.';
COMMENT ON COLUMN public.invoices.in_use_by_user_id IS
  'Auth user id holding the invoice workspace lock.';
COMMENT ON COLUMN public.invoices.in_use_at IS
  'Last acquire/heartbeat time for the invoice lock (stale reclaim).';
