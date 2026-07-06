-- Fix RLS bootstrap: Supabase anon/publishable key always sends a JWT (role=anon).
-- credyx_auth_not_configured() previously checked auth.jwt() IS NULL, which is never true.

CREATE OR REPLACE FUNCTION credyx_auth_not_configured()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'anon';
$$;

-- Self-service enrollment: anon may insert; authenticated users without a client link may retry enroll.
DROP POLICY IF EXISTS credyx_clients_insert ON clients;
CREATE POLICY credyx_clients_insert ON clients
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    credyx_is_admin()
    OR auth.role() = 'anon'
    OR (auth.role() = 'authenticated' AND credyx_current_client_id() IS NULL)
  );
