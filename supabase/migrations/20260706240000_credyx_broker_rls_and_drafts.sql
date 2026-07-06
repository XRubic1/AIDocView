-- Allow authenticated portal users to add/update brokers during batch entry.
-- Draft batches should not collide on (client_id, batch_number) when persisted.

DROP POLICY IF EXISTS credyx_brokers_write ON brokers;
CREATE POLICY credyx_brokers_write ON brokers
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    credyx_is_admin()
    OR credyx_auth_not_configured()
    OR auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS credyx_brokers_update ON brokers;
CREATE POLICY credyx_brokers_update ON brokers
  FOR UPDATE TO anon, authenticated
  USING (
    credyx_is_admin()
    OR credyx_auth_not_configured()
    OR auth.role() = 'authenticated'
  )
  WITH CHECK (
    credyx_is_admin()
    OR credyx_auth_not_configured()
    OR auth.role() = 'authenticated'
  );
