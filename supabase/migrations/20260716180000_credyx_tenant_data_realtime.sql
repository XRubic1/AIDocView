-- Realtime for cross-session batch + payment sync (client ↔ Credyx admin).

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE batches;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE payments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
