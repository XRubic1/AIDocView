-- Page load reads the newest profiles with ORDER BY analyzed_at DESC LIMIT n.
-- The (client_id, broker_id, analyzed_at) index cannot serve that order, so
-- Postgres sorted the whole history and the API statement timed out.

CREATE INDEX IF NOT EXISTS broker_risk_profiles_analyzed_at_idx
  ON broker_risk_profiles (analyzed_at DESC);

CREATE INDEX IF NOT EXISTS broker_risk_profiles_client_analyzed_idx
  ON broker_risk_profiles (client_id, analyzed_at DESC);
