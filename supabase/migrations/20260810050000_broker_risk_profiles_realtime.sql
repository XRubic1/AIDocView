-- Live sync Publish / Clear to carrier portals (same as batches/invoices).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE broker_risk_profiles;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
