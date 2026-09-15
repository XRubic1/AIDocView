-- Background DocSort + AI verification jobs (client / Credyx submit → auto process).

CREATE TABLE IF NOT EXISTS public.batch_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  -- verify_only: DocSort snapshot already present; run AI verification.
  -- sort_and_verify: need DocSort (or re-sort) then AI verification.
  kind TEXT NOT NULL DEFAULT 'verify_only'
    CHECK (kind IN ('verify_only', 'sort_and_verify')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS batch_processing_jobs_status_created_idx
  ON public.batch_processing_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS batch_processing_jobs_batch_id_idx
  ON public.batch_processing_jobs (batch_id);

-- One active (pending/running) job per batch.
CREATE UNIQUE INDEX IF NOT EXISTS batch_processing_jobs_active_batch_uidx
  ON public.batch_processing_jobs (batch_id)
  WHERE status IN ('pending', 'running');

ALTER TABLE public.batch_processing_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS batch_processing_jobs_admin_select ON public.batch_processing_jobs;
CREATE POLICY batch_processing_jobs_admin_select
  ON public.batch_processing_jobs
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS batch_processing_jobs_client_select ON public.batch_processing_jobs;
CREATE POLICY batch_processing_jobs_client_select
  ON public.batch_processing_jobs
  FOR SELECT
  TO authenticated
  USING (
    client_id IS NOT NULL
    AND client_id = (auth.jwt() -> 'app_metadata' ->> 'client_id')
  );

CREATE OR REPLACE FUNCTION public.enqueue_batch_processing_job(
  p_batch_id TEXT,
  p_client_id TEXT,
  p_kind TEXT DEFAULT 'verify_only'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_kind TEXT := COALESCE(NULLIF(trim(p_kind), ''), 'verify_only');
BEGIN
  IF v_kind NOT IN ('verify_only', 'sort_and_verify') THEN
    RAISE EXCEPTION 'invalid job kind: %', v_kind;
  END IF;

  SELECT id INTO v_id
  FROM public.batch_processing_jobs
  WHERE batch_id = p_batch_id
    AND status IN ('pending', 'running')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.batch_processing_jobs
    SET kind = v_kind, updated_at = now()
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  -- Revive latest failed job instead of stacking forever.
  SELECT id INTO v_id
  FROM public.batch_processing_jobs
  WHERE batch_id = p_batch_id
    AND status = 'failed'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.batch_processing_jobs
    SET
      status = 'pending',
      kind = v_kind,
      last_error = NULL,
      locked_at = NULL,
      locked_by = NULL,
      started_at = NULL,
      finished_at = NULL,
      updated_at = now()
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.batch_processing_jobs (batch_id, client_id, kind, status)
  VALUES (p_batch_id, p_client_id, v_kind, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_batch_processing_job(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_batch_processing_job(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_batch_processing_job(TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_batch_processing_job(
  p_batch_id TEXT,
  p_status TEXT,
  p_last_error TEXT DEFAULT NULL,
  p_locked_by TEXT DEFAULT 'browser-pipeline'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_attempts INTEGER;
BEGIN
  IF p_status NOT IN ('running', 'succeeded', 'failed') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  SELECT id, attempts INTO v_id, v_attempts
  FROM public.batch_processing_jobs
  WHERE batch_id = p_batch_id
    AND status IN ('pending', 'running')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  IF p_status = 'running' THEN
    UPDATE public.batch_processing_jobs
    SET
      status = 'running',
      attempts = COALESCE(v_attempts, 0) + 1,
      started_at = COALESCE(started_at, now()),
      locked_at = now(),
      locked_by = p_locked_by,
      last_error = NULL,
      updated_at = now()
    WHERE id = v_id;
  ELSE
    UPDATE public.batch_processing_jobs
    SET
      status = p_status,
      finished_at = now(),
      locked_at = NULL,
      locked_by = NULL,
      last_error = p_last_error,
      updated_at = now()
    WHERE id = v_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_batch_processing_job(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_batch_processing_job(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_batch_processing_job(TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.batch_processing_jobs IS
  'Queue for automated DocSort + AI verification after batch submit.';
