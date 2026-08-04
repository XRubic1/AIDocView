-- Fix waitlist_signups RLS policy for anonymous inserts.
-- The previous policy should work, but we're making it more explicit
-- and ensuring there are no conflicts with other policies.

-- Drop and recreate the anon insert policy with explicit role targeting
DROP POLICY IF EXISTS waitlist_signups_anon_insert ON waitlist_signups;

-- Allow anon role to insert without any conditions
CREATE POLICY waitlist_signups_anon_insert ON waitlist_signups
  FOR INSERT TO anon
  WITH CHECK (true);

-- Separate policy for authenticated users (not strictly needed for waitlist, but keeping it for consistency)
DROP POLICY IF EXISTS waitlist_signups_authenticated_insert ON waitlist_signups;
CREATE POLICY waitlist_signups_authenticated_insert ON waitlist_signups
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Ensure anon role has INSERT grant (should already exist, but being explicit)
GRANT INSERT ON waitlist_signups TO anon;
GRANT USAGE ON SCHEMA public TO anon;
