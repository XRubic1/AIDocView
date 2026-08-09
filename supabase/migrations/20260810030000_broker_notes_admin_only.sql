-- Broker.notes are Credyx-internal warnings. Carriers must not set or change them.
-- Admins keep full read/write; non-admin INSERT forces notes NULL; UPDATE preserves OLD.notes.

CREATE OR REPLACE FUNCTION credyx_broker_notes_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins (and pre-auth bootstrap) may write notes freely.
  IF credyx_is_admin() OR credyx_auth_not_configured() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.notes := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.notes := OLD.notes;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broker_notes_admin_only ON brokers;
CREATE TRIGGER trg_broker_notes_admin_only
  BEFORE INSERT OR UPDATE ON brokers
  FOR EACH ROW
  EXECUTE FUNCTION credyx_broker_notes_admin_only();

COMMENT ON FUNCTION credyx_broker_notes_admin_only() IS
  'Blocks non-admin writes to brokers.notes; preserves existing notes on carrier updates.';
