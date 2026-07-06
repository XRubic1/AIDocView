-- Credyx core schema: clients, brokers, batches, invoices, payments

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE client_status AS ENUM ('active', 'inactive', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE service_tier AS ENUM ('self_service', 'managed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE batch_status AS ENUM (
    'draft', 'ready_to_post', 'verification', 'approval',
    'submitted', 'processing', 'documents_uploaded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE upload_mode AS ENUM ('ai', 'manual', 'handoff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sort_status AS ENUM ('pending', 'sorting', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM (
    'pending', 'approved', 'rejected', 'hold', 'paid', 'force_closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'confirmed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('check', 'wire', 'ach', 'credit_card');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  fax TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  mc_number TEXT,
  dot_number TEXT,
  remittance_info TEXT,
  bank_name TEXT,
  account_number TEXT,
  routing_number TEXT,
  notes TEXT,
  status client_status NOT NULL DEFAULT 'pending',
  service_tier service_tier NOT NULL DEFAULT 'self_service',
  fleet_size TEXT,
  billing JSONB,
  fee_terms JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clients_email_idx ON clients (LOWER(email));

CREATE TABLE IF NOT EXISTS brokers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  emails JSONB,
  phone TEXT,
  phones JSONB,
  fax TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  mc_number TEXT,
  dot_number TEXT,
  notes TEXT,
  payment_terms_days INT DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brokers_name_idx ON brokers (LOWER(name));

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  batch_number TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  total_invoices INT NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  minutes_since_submitted INT NOT NULL DEFAULT 0,
  status batch_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  in_use BOOLEAN NOT NULL DEFAULT FALSE,
  in_use_by TEXT,
  fee_calculation JSONB,
  upload_mode upload_mode,
  sort_status sort_status,
  doc_sort_snapshot TEXT,
  unmatched_doc_ids JSONB,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  approved_count INT,
  rejected_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS batches_client_id_idx ON batches (client_id);
CREATE INDEX IF NOT EXISTS batches_status_idx ON batches (status);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  broker_id TEXT REFERENCES brokers(id) ON DELETE SET NULL,
  broker_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  paid_amount NUMERIC(12, 2),
  overpayment_accepted_at TIMESTAMPTZ,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  expected_payment_date DATE NOT NULL,
  status invoice_status NOT NULL DEFAULT 'pending',
  load_number TEXT,
  batch_id TEXT REFERENCES batches(id) ON DELETE SET NULL,
  batch_number TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  hold_reason TEXT,
  notes TEXT,
  notes_history JSONB NOT NULL DEFAULT '[]'::JSONB,
  disputes JSONB NOT NULL DEFAULT '[]'::JSONB,
  documents_count INT DEFAULT 0,
  broker_contacted BOOLEAN DEFAULT FALSE,
  last_broker_contact TIMESTAMPTZ,
  days_since_expected INT,
  document_send_history JSONB NOT NULL DEFAULT '[]'::JSONB,
  collection_date DATE,
  collection_status TEXT,
  verification_status TEXT,
  contact_persons JSONB,
  selected_contact_person TEXT,
  ai_confirmed_at TIMESTAMPTZ,
  ai_confirmed_by TEXT,
  ai_review_status TEXT DEFAULT 'not_run',
  ai_review_summary TEXT,
  ai_review_snapshot TEXT,
  doc_sort_group_id TEXT,
  document_doc_ids JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS invoices_client_id_idx ON invoices (client_id);
CREATE INDEX IF NOT EXISTS invoices_broker_id_idx ON invoices (broker_id);
CREATE INDEX IF NOT EXISTS invoices_batch_id_idx ON invoices (batch_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  broker_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  payment_date DATE NOT NULL,
  received_date DATE NOT NULL,
  payment_method payment_method NOT NULL,
  payment_reference TEXT,
  status payment_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  batch_id TEXT REFERENCES batches(id) ON DELETE SET NULL,
  batch_number TEXT,
  load_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments (invoice_id);

CREATE OR REPLACE FUNCTION credyx_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clients_updated_at ON clients;
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION credyx_set_updated_at();

DROP TRIGGER IF EXISTS brokers_updated_at ON brokers;
CREATE TRIGGER brokers_updated_at
  BEFORE UPDATE ON brokers
  FOR EACH ROW EXECUTE FUNCTION credyx_set_updated_at();

DROP TRIGGER IF EXISTS batches_updated_at ON batches;
CREATE TRIGGER batches_updated_at
  BEFORE UPDATE ON batches
  FOR EACH ROW EXECUTE FUNCTION credyx_set_updated_at();

DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION credyx_set_updated_at();

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credyx_clients_all ON clients;
CREATE POLICY credyx_clients_all ON clients
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS credyx_brokers_all ON brokers;
CREATE POLICY credyx_brokers_all ON brokers
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS credyx_batches_all ON batches;
CREATE POLICY credyx_batches_all ON batches
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS credyx_invoices_all ON invoices;
CREATE POLICY credyx_invoices_all ON invoices
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS credyx_payments_all ON payments;
CREATE POLICY credyx_payments_all ON payments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
