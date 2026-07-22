-- Client in-app / email notification preference toggles (JSONB on clients).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB;

COMMENT ON COLUMN public.clients.notification_prefs IS
  'Client portal bell/email notification toggles (payment, hold, notes, short/over, dispute).';
