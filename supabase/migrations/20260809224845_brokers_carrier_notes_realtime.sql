-- Live sync broker carrier_notes / directory updates to open portals.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE brokers;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
