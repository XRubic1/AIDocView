-- Enrollment auth link: direct INSERT fails when signUp returns no session (email confirm / anon role).
-- Use a SECURITY DEFINER RPC with email + recency checks for the post-signUp window.

CREATE OR REPLACE FUNCTION credyx_complete_enrollment(p_client_id text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  client_email text;
  user_email text;
  user_created timestamptz;
BEGIN
  IF p_client_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'client_id and user_id are required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  -- Authenticated path: user may only link themselves
  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Cannot link a different user';
    END IF;
    INSERT INTO public.client_auth_links (user_id, client_id)
    VALUES (p_user_id, p_client_id)
    ON CONFLICT (user_id) DO UPDATE SET client_id = EXCLUDED.client_id;
    RETURN;
  END IF;

  -- Anon path (signUp without session): verify email match + recent account
  SELECT email INTO client_email FROM public.clients WHERE id = p_client_id;
  SELECT email, created_at INTO user_email, user_created
  FROM auth.users WHERE id = p_user_id;

  IF client_email IS NULL OR user_email IS NULL THEN
    RAISE EXCEPTION 'Invalid enrollment';
  END IF;

  IF lower(trim(client_email)) <> lower(trim(user_email)) THEN
    RAISE EXCEPTION 'Email mismatch';
  END IF;

  IF user_created < now() - interval '15 minutes' THEN
    RAISE EXCEPTION 'Enrollment window expired — sign in instead';
  END IF;

  INSERT INTO public.client_auth_links (user_id, client_id)
  VALUES (p_user_id, p_client_id)
  ON CONFLICT (user_id) DO UPDATE SET client_id = EXCLUDED.client_id;
END;
$$;

REVOKE ALL ON FUNCTION credyx_complete_enrollment(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION credyx_complete_enrollment(text, uuid) TO anon, authenticated;
