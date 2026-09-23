-- Progress heartbeats for Doc Split / browser pipeline must not wipe last_error
-- or burn attempts on every mark_batch_processing_job(..., 'running', ...).

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
  v_status TEXT;
BEGIN
  IF p_status NOT IN ('running', 'succeeded', 'failed') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  SELECT id, attempts, status INTO v_id, v_attempts, v_status
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
      -- Only count a new attempt when leaving pending (not every heartbeat).
      attempts = CASE
        WHEN v_status = 'pending' THEN COALESCE(v_attempts, 0) + 1
        ELSE COALESCE(v_attempts, 0)
      END,
      started_at = COALESCE(started_at, now()),
      locked_at = now(),
      locked_by = p_locked_by,
      -- Keep progress messages (AI splitting… / Creating packets…).
      last_error = CASE
        WHEN p_last_error IS NOT NULL AND btrim(p_last_error) <> '' THEN p_last_error
        ELSE last_error
      END,
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
