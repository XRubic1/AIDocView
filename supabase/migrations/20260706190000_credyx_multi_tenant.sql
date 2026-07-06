-- Multi-tenant isolation: client_id on payments, integrity checks, scoped indexes, auth-ready RLS

-- ---------------------------------------------------------------------------
-- Helper functions (auth.jwt app_metadata — never user_metadata for auth)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION credyx_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

CREATE OR REPLACE FUNCTION credyx_current_client_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'client_id', '');
$$;

/** True when no JWT is present (pre-auth bootstrap with publishable key). */
CREATE OR REPLACE FUNCTION credyx_auth_not_configured()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.jwt() IS NULL;
$$;

CREATE OR REPLACE FUNCTION credyx_can_access_client(row_client_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    credyx_is_admin()
    OR credyx_auth_not_configured()
    OR (credyx_current_client_id() IS NOT NULL AND row_client_id = credyx_current_client_id());
$$;

-- ---------------------------------------------------------------------------
-- Payments: direct client_id for per-client queries (no join required)
-- ---------------------------------------------------------------------------

ALTER TABLE payments ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES clients(id) ON DELETE CASCADE;

UPDATE payments p
SET client_id = i.client_id
FROM invoices i
WHERE p.invoice_id = i.id
  AND p.client_id IS NULL;

ALTER TABLE payments ALTER COLUMN client_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS payments_client_id_idx ON payments (client_id);
CREATE INDEX IF NOT EXISTS payments_client_received_idx ON payments (client_id, received_date DESC);

-- ---------------------------------------------------------------------------
-- Per-client composite indexes (fast filtered lists per carrier)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS batches_client_status_idx ON batches (client_id, status);
CREATE INDEX IF NOT EXISTS batches_client_submitted_idx ON batches (client_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS invoices_client_status_idx ON invoices (client_id, status);
CREATE INDEX IF NOT EXISTS invoices_client_created_idx ON invoices (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_client_expected_pay_idx ON invoices (client_id, expected_payment_date);

-- Invoice / batch numbers unique within a client (not globally)
CREATE UNIQUE INDEX IF NOT EXISTS invoices_client_number_uidx ON invoices (client_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS batches_client_number_uidx ON batches (client_id, batch_number);

-- ---------------------------------------------------------------------------
-- Integrity: child rows must belong to the same client as their parent
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION credyx_check_invoice_batch_client()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM batches b
      WHERE b.id = NEW.batch_id AND b.client_id = NEW.client_id
    ) THEN
      RAISE EXCEPTION 'invoice batch_id must belong to the same client_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_batch_client_check ON invoices;
CREATE TRIGGER invoices_batch_client_check
  BEFORE INSERT OR UPDATE OF batch_id, client_id ON invoices
  FOR EACH ROW EXECUTE FUNCTION credyx_check_invoice_batch_client();

CREATE OR REPLACE FUNCTION credyx_sync_payment_client_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  inv_client_id text;
BEGIN
  SELECT client_id INTO inv_client_id FROM invoices WHERE id = NEW.invoice_id;
  IF inv_client_id IS NULL THEN
    RAISE EXCEPTION 'payment invoice_id does not exist';
  END IF;
  NEW.client_id := inv_client_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_sync_client_id ON payments;
CREATE TRIGGER payments_sync_client_id
  BEFORE INSERT OR UPDATE OF invoice_id ON payments
  FOR EACH ROW EXECUTE FUNCTION credyx_sync_payment_client_id();

-- ---------------------------------------------------------------------------
-- Replace open RLS with tenant-scoped policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS credyx_clients_all ON clients;
DROP POLICY IF EXISTS credyx_batches_all ON batches;
DROP POLICY IF EXISTS credyx_invoices_all ON invoices;
DROP POLICY IF EXISTS credyx_payments_all ON payments;
DROP POLICY IF EXISTS credyx_brokers_all ON brokers;

-- Clients: own row or admin (or pre-auth bootstrap)
CREATE POLICY credyx_clients_select ON clients
  FOR SELECT TO anon, authenticated
  USING (
    credyx_is_admin()
    OR credyx_auth_not_configured()
    OR id = credyx_current_client_id()
  );

CREATE POLICY credyx_clients_insert ON clients
  FOR INSERT TO anon, authenticated
  WITH CHECK (credyx_is_admin() OR credyx_auth_not_configured());

CREATE POLICY credyx_clients_update ON clients
  FOR UPDATE TO anon, authenticated
  USING (
    credyx_is_admin()
    OR credyx_auth_not_configured()
    OR id = credyx_current_client_id()
  )
  WITH CHECK (
    credyx_is_admin()
    OR credyx_auth_not_configured()
    OR id = credyx_current_client_id()
  );

-- Batches / invoices / payments: scoped by client_id
CREATE POLICY credyx_batches_tenant ON batches
  FOR ALL TO anon, authenticated
  USING (credyx_can_access_client(client_id))
  WITH CHECK (credyx_can_access_client(client_id));

CREATE POLICY credyx_invoices_tenant ON invoices
  FOR ALL TO anon, authenticated
  USING (credyx_can_access_client(client_id))
  WITH CHECK (credyx_can_access_client(client_id));

CREATE POLICY credyx_payments_tenant ON payments
  FOR ALL TO anon, authenticated
  USING (credyx_can_access_client(client_id))
  WITH CHECK (credyx_can_access_client(client_id));

-- Brokers: shared network directory (read all; write admin or bootstrap)
CREATE POLICY credyx_brokers_select ON brokers
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY credyx_brokers_write ON brokers
  FOR INSERT TO anon, authenticated
  WITH CHECK (credyx_is_admin() OR credyx_auth_not_configured());

CREATE POLICY credyx_brokers_update ON brokers
  FOR UPDATE TO anon, authenticated
  USING (credyx_is_admin() OR credyx_auth_not_configured())
  WITH CHECK (credyx_is_admin() OR credyx_auth_not_configured());

CREATE POLICY credyx_brokers_delete ON brokers
  FOR DELETE TO anon, authenticated
  USING (credyx_is_admin() OR credyx_auth_not_configured());

-- Fix search_path on updated_at trigger
CREATE OR REPLACE FUNCTION credyx_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
