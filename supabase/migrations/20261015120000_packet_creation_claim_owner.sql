-- Record who actually claimed a packet-creation turn.
-- The previous version always wrote locked_by = 'browser-pipeline', so jobs the
-- edge worker claimed looked like browser jobs to every reclaim check.

DROP FUNCTION IF EXISTS public.claim_packet_creation_turn(TEXT);

CREATE OR REPLACE FUNCTION public.claim_packet_creation_turn(
  p_batch_id TEXT,
  p_locked_by TEXT DEFAULT 'browser-pipeline'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_status TEXT;
  v_locked_at TIMESTAMPTZ;
  v_owner TEXT := COALESCE(NULLIF(btrim(p_locked_by), ''), 'browser-pipeline');
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
    locked_by = v_owner,
    updated_at = now()
  WHERE id = v_id;

  RETURN 'started';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_packet_creation_turn(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_packet_creation_turn(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_packet_creation_turn(TEXT, TEXT) TO service_role;
