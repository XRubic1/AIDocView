-- Fix client updates from ops UI while signed in as a portal user.
-- Upsert hit INSERT RLS; authenticated users also need UPDATE on any client row (internal ops desk).

DROP POLICY IF EXISTS credyx_clients_update ON clients;
CREATE POLICY credyx_clients_update ON clients
  FOR UPDATE TO anon, authenticated
  USING (
    credyx_is_admin()
    OR credyx_auth_not_configured()
    OR id = credyx_current_client_id()
    OR auth.role() = 'authenticated'
  )
  WITH CHECK (
    credyx_is_admin()
    OR credyx_auth_not_configured()
    OR id = credyx_current_client_id()
    OR auth.role() = 'authenticated'
  );
