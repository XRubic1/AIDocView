-- One packet-creation job (sort_and_verify) at a time across all clients.
-- Two submits used to start together and share the OpenAI token limit.

CREATE OR REPLACE FUNCTION public.claim_packet_creation_turn(p_batch_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_status TEXT;
  v_locked_at TIMESTAMPTZ;
BEGIN
  IF p_batch_id IS NULL OR btrim(p_batch_id) = '' THEN
    RETURN 'queued';
  END IF;

  PERFORM pg_advisory_xact_lock(4815162342);

  IF EXISTS (
    SELECT 1
    FROM public.batch_processing_jobs
    WHERE kind = 'sort_and_verify'
      AND status = 'running'
      AND batch_id IS DISTINCT FROM p_batch_id
      AND locked_at IS NOT NULL
      AND locked_at > now() - interval '5 minutes'
  ) THEN
    RETURN 'queued';
  END IF;

  SELECT id, status, locked_at
    INTO v_id, v_status, v_locked_at
  FROM public.batch_processing_jobs
  WHERE batch_id = p_batch_id
    AND kind = 'sort_and_verify'
    AND status IN ('pending', 'running')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN 'started';
  END IF;

  IF v_status = 'running'
     AND v_locked_at IS NOT NULL
     AND v_locked_at > now() - interval '5 minutes' THEN
    RETURN 'busy';
  END IF;

  UPDATE public.batch_processing_jobs
  SET
    status = 'running',
    attempts = CASE
      WHEN status = 'pending' THEN COALESCE(attempts, 0) + 1
      ELSE COALESCE(attempts, 0)
    END,
    started_at = COALESCE(started_at, now()),
    locked_at = now(),
    locked_by = 'browser-pipeline',
    updated_at = now()
  WHERE id = v_id;

  RETURN 'started';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_packet_creation_turn(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_packet_creation_turn(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_packet_creation_turn(TEXT) TO service_role;
