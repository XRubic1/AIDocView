-- Allow client-portal sessions to create Credyx admin notifications
-- (payment disputes, receipt confirmations, etc.). Reads/updates stay admin-only.

DROP POLICY IF EXISTS credyx_admin_notifications ON admin_notifications;

CREATE POLICY credyx_admin_notifications_select ON admin_notifications
  FOR SELECT TO authenticated
  USING (credyx_is_admin() OR credyx_auth_not_configured());

CREATE POLICY credyx_admin_notifications_update ON admin_notifications
  FOR UPDATE TO authenticated
  USING (credyx_is_admin() OR credyx_auth_not_configured())
  WITH CHECK (credyx_is_admin() OR credyx_auth_not_configured());

CREATE POLICY credyx_admin_notifications_delete ON admin_notifications
  FOR DELETE TO authenticated
  USING (credyx_is_admin() OR credyx_auth_not_configured());

-- Clients (and admins) may insert; mirrors audit_logs client-insert pattern.
CREATE POLICY credyx_admin_notifications_insert ON admin_notifications
  FOR INSERT TO authenticated, anon
  WITH CHECK (
    credyx_is_admin()
    OR credyx_auth_not_configured()
    OR auth.uid() IS NOT NULL
    OR credyx_current_client_id() IS NOT NULL
  );

-- Live updates for Credyx admin bell across browser sessions.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE admin_notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
