-- Freeze broker status on each MC Lookup so carriers can see what they reviewed and when.
-- Carriers may read their own lookup log; Credyx admin still reads every row.

ALTER TABLE public.broker_snapshot_lookup_events
  ADD COLUMN IF NOT EXISTS found BOOLEAN,
  ADD COLUMN IF NOT EXISTS operating_status TEXT,
  ADD COLUMN IF NOT EXISTS broker_authority TEXT,
  ADD COLUMN IF NOT EXISTS status_label TEXT;

COMMENT ON COLUMN public.broker_snapshot_lookup_events.found IS
  'Whether BrokerSnapshot returned a company at lookup time.';
COMMENT ON COLUMN public.broker_snapshot_lookup_events.operating_status IS
  'FMCSA / Snapshot operating status at lookup time.';
COMMENT ON COLUMN public.broker_snapshot_lookup_events.broker_authority IS
  'Broker authority (Active / Inactive / None) at lookup time.';
COMMENT ON COLUMN public.broker_snapshot_lookup_events.status_label IS
  'Compact status line shown in the carrier review log (frozen at lookup time).';

COMMENT ON TABLE public.broker_snapshot_lookup_events IS
  'Each carrier (or admin) MC Lookup, with broker status frozen at review time.';

-- Best-effort backfill from the cached Snapshot still on file (not a perfect historical freeze).
UPDATE public.broker_snapshot_lookup_events e
SET
  found = COALESCE(
    e.found,
    CASE
      WHEN jsonb_typeof(s.payload -> 'found') = 'boolean'
        THEN (s.payload ->> 'found')::boolean
      ELSE NULL
    END
  ),
  operating_status = COALESCE(
    e.operating_status,
    NULLIF(s.payload ->> 'operatingStatus', '')
  ),
  broker_authority = COALESCE(
    e.broker_authority,
    NULLIF(s.payload ->> 'brokerAuthority', '')
  )
FROM public.broker_external_snapshots s
WHERE e.snapshot_id = s.id
  AND (
    e.found IS NULL
    OR e.operating_status IS NULL
    OR e.broker_authority IS NULL
  );

UPDATE public.broker_snapshot_lookup_events
SET status_label = CASE
  WHEN found IS FALSE THEN 'No company found'
  WHEN COALESCE(broker_authority, '') <> ''
    AND COALESCE(insurance_verdict, '') = 'ok'
    THEN 'Broker ' || broker_authority || ' · Insurance OK'
  WHEN COALESCE(broker_authority, '') <> ''
    AND COALESCE(insurance_verdict, '') = 'cancelled'
    THEN 'Broker ' || broker_authority || ' · Insurance cancelled'
  WHEN COALESCE(broker_authority, '') <> ''
    AND COALESCE(insurance_verdict, '') = 'missing'
    THEN 'Broker ' || broker_authority || ' · Insurance missing'
  WHEN COALESCE(broker_authority, '') <> ''
    THEN 'Broker ' || broker_authority
  WHEN COALESCE(operating_status, '') <> ''
    AND COALESCE(insurance_verdict, '') = 'ok'
    THEN operating_status || ' · Insurance OK'
  WHEN COALESCE(operating_status, '') <> ''
    THEN operating_status
  WHEN COALESCE(insurance_verdict, '') = 'ok' THEN 'Insurance OK'
  WHEN COALESCE(insurance_verdict, '') = 'cancelled' THEN 'Insurance cancelled'
  WHEN COALESCE(insurance_verdict, '') = 'missing' THEN 'Insurance missing'
  WHEN COALESCE(insurance_verdict, '') = 'warning' THEN 'Insurance warning'
  ELSE 'Looked up'
END
WHERE status_label IS NULL;

DROP POLICY IF EXISTS broker_snapshot_lookup_events_select_carrier
  ON public.broker_snapshot_lookup_events;
CREATE POLICY broker_snapshot_lookup_events_select_carrier
  ON public.broker_snapshot_lookup_events
  FOR SELECT
  TO authenticated
  USING (
    client_id IS NOT NULL
    AND credyx_can_access_client(client_id)
  );
