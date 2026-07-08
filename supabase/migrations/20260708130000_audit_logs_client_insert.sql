-- Allow authenticated client-portal sessions to write audit logs.
-- Client JWTs carry app_metadata.client_id (used by credyx_current_client_id())
-- but may not expose auth.uid(); tenant writes succeed while audit inserts were
-- rejected by RLS. Broaden the insert check to accept a valid tenant identity.
-- Reads remain admin-only.

DROP POLICY IF EXISTS credyx_audit_logs_insert ON audit_logs;
CREATE POLICY credyx_audit_logs_insert ON audit_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    credyx_is_admin()
    OR credyx_auth_not_configured()
    OR auth.uid() IS NOT NULL
    OR credyx_current_client_id() IS NOT NULL
  );
