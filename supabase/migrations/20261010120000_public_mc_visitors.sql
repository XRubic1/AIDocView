-- Public /MC site: carrier visitors + broker MC checks they run.

CREATE TABLE IF NOT EXISTS public_mc_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mc_digits text NOT NULL,
  mc_number text NOT NULL,
  company_name text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  unlock_count integer NOT NULL DEFAULT 1 CHECK (unlock_count >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_mc_visitors_mc_digits_unique UNIQUE (mc_digits)
);

CREATE INDEX IF NOT EXISTS public_mc_visitors_first_seen_idx
  ON public_mc_visitors (first_seen_at DESC);

CREATE INDEX IF NOT EXISTS public_mc_visitors_last_seen_idx
  ON public_mc_visitors (last_seen_at DESC);

COMMENT ON TABLE public_mc_visitors IS
  'Carriers who unlocked the public /MC site with their own MC. Name is stored once.';

CREATE TABLE IF NOT EXISTS public_mc_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL REFERENCES public_mc_visitors(id) ON DELETE CASCADE,
  visitor_mc_digits text NOT NULL,
  search_kind text NOT NULL CHECK (search_kind IN ('MC', 'DOT', 'FF')),
  searched_digits text NOT NULL,
  searched_label text,
  company_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_mc_checks_visitor_idx
  ON public_mc_checks (visitor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS public_mc_checks_created_idx
  ON public_mc_checks (created_at DESC);

COMMENT ON TABLE public_mc_checks IS
  'Each broker/MC lookup run on the public /MC site, attributed to a carrier visitor.';

ALTER TABLE public_mc_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_mc_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_mc_visitors_admin_select ON public_mc_visitors;
CREATE POLICY public_mc_visitors_admin_select ON public_mc_visitors
  FOR SELECT TO authenticated
  USING (credyx_is_admin());

DROP POLICY IF EXISTS public_mc_checks_admin_select ON public_mc_checks;
CREATE POLICY public_mc_checks_admin_select ON public_mc_checks
  FOR SELECT TO authenticated
  USING (credyx_is_admin());

GRANT SELECT ON public_mc_visitors TO authenticated;
GRANT SELECT ON public_mc_checks TO authenticated;

-- Look up one visitor by MC digits (no full-table leak).
CREATE OR REPLACE FUNCTION public_mc_find_visitor(p_mc_digits text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text := regexp_replace(COALESCE(p_mc_digits, ''), '\D', '', 'g');
  v_row public_mc_visitors%ROWTYPE;
BEGIN
  IF length(v_digits) < 4 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_row
  FROM public_mc_visitors
  WHERE mc_digits = v_digits;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'id', v_row.id,
    'mc_digits', v_row.mc_digits,
    'mc_number', v_row.mc_number,
    'company_name', v_row.company_name,
    'first_seen_at', v_row.first_seen_at,
    'unlock_count', v_row.unlock_count
  );
END;
$$;

-- Returning visitor: bump last_seen + unlock_count; use stored company name.
CREATE OR REPLACE FUNCTION public_mc_touch_visitor(p_mc_digits text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text := regexp_replace(COALESCE(p_mc_digits, ''), '\D', '', 'g');
  v_row public_mc_visitors%ROWTYPE;
BEGIN
  IF length(v_digits) < 4 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  UPDATE public_mc_visitors
  SET
    last_seen_at = now(),
    unlock_count = unlock_count + 1
  WHERE mc_digits = v_digits
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'is_new', false,
    'id', v_row.id,
    'mc_digits', v_row.mc_digits,
    'mc_number', v_row.mc_number,
    'company_name', v_row.company_name,
    'first_seen_at', v_row.first_seen_at,
    'unlock_count', v_row.unlock_count
  );
END;
$$;

-- First-time visitor: store MC + company name (from BrokerSnapshot). Race-safe.
CREATE OR REPLACE FUNCTION public_mc_register_visitor(
  p_mc_digits text,
  p_company_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text := regexp_replace(COALESCE(p_mc_digits, ''), '\D', '', 'g');
  v_name text := NULLIF(trim(COALESCE(p_company_name, '')), '');
  v_row public_mc_visitors%ROWTYPE;
  v_is_new boolean := false;
BEGIN
  IF length(v_digits) < 4 THEN
    RAISE EXCEPTION 'invalid_mc' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public_mc_visitors (mc_digits, mc_number, company_name)
  VALUES (v_digits, 'MC-' || v_digits, v_name)
  ON CONFLICT (mc_digits) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND THEN
    v_is_new := true;
  ELSE
    UPDATE public_mc_visitors
    SET
      last_seen_at = now(),
      unlock_count = unlock_count + 1,
      company_name = COALESCE(company_name, v_name)
    WHERE mc_digits = v_digits
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'is_new', v_is_new,
    'id', v_row.id,
    'mc_digits', v_row.mc_digits,
    'mc_number', v_row.mc_number,
    'company_name', v_row.company_name,
    'first_seen_at', v_row.first_seen_at,
    'unlock_count', v_row.unlock_count
  );
END;
$$;

-- Record one broker/MC lookup attributed to a carrier visitor.
CREATE OR REPLACE FUNCTION public_mc_record_check(
  p_visitor_mc_digits text,
  p_search_kind text,
  p_searched_digits text,
  p_searched_label text DEFAULT NULL,
  p_company_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visitor_digits text := regexp_replace(COALESCE(p_visitor_mc_digits, ''), '\D', '', 'g');
  v_searched_digits text := regexp_replace(COALESCE(p_searched_digits, ''), '\D', '', 'g');
  v_kind text := upper(trim(COALESCE(p_search_kind, 'MC')));
  v_visitor_id uuid;
  v_id uuid;
BEGIN
  IF length(v_visitor_digits) < 4 OR length(v_searched_digits) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF v_kind NOT IN ('MC', 'DOT', 'FF') THEN
    v_kind := 'MC';
  END IF;

  SELECT id INTO v_visitor_id
  FROM public_mc_visitors
  WHERE mc_digits = v_visitor_digits;

  IF v_visitor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'visitor_not_found');
  END IF;

  INSERT INTO public_mc_checks (
    visitor_id,
    visitor_mc_digits,
    search_kind,
    searched_digits,
    searched_label,
    company_name
  )
  VALUES (
    v_visitor_id,
    v_visitor_digits,
    v_kind,
    v_searched_digits,
    NULLIF(trim(COALESCE(p_searched_label, '')), ''),
    NULLIF(trim(COALESCE(p_company_name, '')), '')
  )
  RETURNING id INTO v_id;

  UPDATE public_mc_visitors
  SET last_seen_at = now()
  WHERE id = v_visitor_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public_mc_find_visitor(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_mc_touch_visitor(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_mc_register_visitor(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_mc_record_check(text, text, text, text, text) TO anon, authenticated;
