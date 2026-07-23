-- Remittance change tracking: stamp when carrier remit-to moves; snapshot per invoice.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS remittance_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.clients.remittance_updated_at IS
  'When remittance_info / bank fields last changed (for broker change flags).';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS remittance_snapshot TEXT;

COMMENT ON COLUMN public.invoices.remittance_snapshot IS
  'Normalized remittance fingerprint at PDF create / paperwork send for change detection.';
