-- Days after PPW sent before Credyx checks that the broker received paperwork.
-- Per-broker override; app default is 7 when this column is null.
ALTER TABLE brokers
  ADD COLUMN IF NOT EXISTS paperwork_status_check_days INT DEFAULT 7;

COMMENT ON COLUMN brokers.paperwork_status_check_days IS
  'Days after PPW sent before Credyx asks the broker to confirm paperwork was received. Default 7; some brokers use 10–15.';
