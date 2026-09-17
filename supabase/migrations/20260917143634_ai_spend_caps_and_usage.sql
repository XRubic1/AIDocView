-- AI spend controls: platform master switch + per-client caps + usage ledger.
-- Uploads must never be blocked by these settings (app gates AI pipelines only).

-- ---------------------------------------------------------------------------
-- 1) Platform AI policy (singleton)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_policy (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ai_enabled boolean NOT NULL DEFAULT true,
  monthly_spend_cap_usd numeric(12, 2) NULL,
  default_client_monthly_cap_usd numeric(12, 2) NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

INSERT INTO public.ai_policy (id, ai_enabled)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ai_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_policy_admin_all" ON public.ai_policy;
CREATE POLICY "ai_policy_admin_all"
  ON public.ai_policy
  FOR ALL
  TO authenticated
  USING (public.credyx_is_admin())
  WITH CHECK (public.credyx_is_admin());

DROP POLICY IF EXISTS "ai_policy_authenticated_read" ON public.ai_policy;
CREATE POLICY "ai_policy_authenticated_read"
  ON public.ai_policy
  FOR SELECT
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 2) Per-client AI settings JSON (toggle + optional monthly cap)
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ai_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clients.ai_settings IS
  'Per-carrier AI controls: { aiEnabled?, limitEnabled?, monthlyCapUsd? }. Uploads never blocked.';

-- ---------------------------------------------------------------------------
-- 3) Usage ledger (token spend for DocSort / review / etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  feature text NOT NULL DEFAULT 'unknown',
  model text NULL,
  prompt_tokens int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  total_tokens int NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12, 6) NOT NULL DEFAULT 0,
  invoice_id text NULL,
  document_id text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_client_created_idx
  ON public.ai_usage_events (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx
  ON public.ai_usage_events (created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_admin_all" ON public.ai_usage_events;
CREATE POLICY "ai_usage_admin_all"
  ON public.ai_usage_events
  FOR ALL
  TO authenticated
  USING (public.credyx_is_admin())
  WITH CHECK (public.credyx_is_admin());

DROP POLICY IF EXISTS "ai_usage_client_read" ON public.ai_usage_events;
CREATE POLICY "ai_usage_client_read"
  ON public.ai_usage_events
  FOR SELECT
  TO authenticated
  USING (
    client_id IS NOT NULL
    AND public.credyx_can_access_client(client_id)
  );

-- Service role / edge may insert via service key (bypasses RLS).
-- Authenticated admins can insert for manual adjustments / app-side logging.
DROP POLICY IF EXISTS "ai_usage_authenticated_insert" ON public.ai_usage_events;
CREATE POLICY "ai_usage_authenticated_insert"
  ON public.ai_usage_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.credyx_is_admin()
    OR (
      client_id IS NOT NULL
      AND public.credyx_can_access_client(client_id)
    )
  );

GRANT SELECT, INSERT ON public.ai_usage_events TO authenticated;
GRANT SELECT ON public.ai_policy TO authenticated;
GRANT ALL ON public.ai_policy TO authenticated;
