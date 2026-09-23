-- Public waitlist / Schedule a demo: anon + authenticated may INSERT.
-- SELECT stays admin-only — the client must not use insert().select() (RETURNING
-- needs SELECT and would fail RLS for public visitors).

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- Drop overlapping / overly open policies from earlier migrations.
DROP POLICY IF EXISTS waitlist_signups_anon_insert ON public.waitlist_signups;
DROP POLICY IF EXISTS "Anonymous can join waitlist" ON public.waitlist_signups;
DROP POLICY IF EXISTS waitlist_signups_admin_select ON public.waitlist_signups;
DROP POLICY IF EXISTS "Service role can read waitlist" ON public.waitlist_signups;
DROP POLICY IF EXISTS waitlist_signups_admin_update ON public.waitlist_signups;
DROP POLICY IF EXISTS "Service role can update waitlist" ON public.waitlist_signups;
DROP POLICY IF EXISTS waitlist_signups_admin_delete ON public.waitlist_signups;

CREATE POLICY waitlist_signups_anon_insert ON public.waitlist_signups
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY waitlist_signups_admin_select ON public.waitlist_signups
  FOR SELECT TO authenticated
  USING (credyx_is_admin());

CREATE POLICY waitlist_signups_admin_update ON public.waitlist_signups
  FOR UPDATE TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

CREATE POLICY waitlist_signups_admin_delete ON public.waitlist_signups
  FOR DELETE TO authenticated
  USING (credyx_is_admin());

GRANT INSERT ON public.waitlist_signups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist_signups TO authenticated;
