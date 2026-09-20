-- Fix waitlist_signups RLS for public waitlist form inserts.
-- Anon may INSERT; only admins may SELECT (see waitlist_signups_admin_select).
-- Client must insert WITHOUT `.select()` / RETURNING — otherwise PostgREST fails RLS.

DROP POLICY IF EXISTS waitlist_signups_anon_insert ON waitlist_signups;
CREATE POLICY waitlist_signups_anon_insert ON waitlist_signups
  FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS waitlist_signups_authenticated_insert ON waitlist_signups;
CREATE POLICY waitlist_signups_authenticated_insert ON waitlist_signups
  FOR INSERT TO authenticated
  WITH CHECK (true);

GRANT INSERT ON waitlist_signups TO anon;
GRANT USAGE ON SCHEMA public TO anon;
