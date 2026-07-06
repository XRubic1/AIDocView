-- Notifications, audit logs, client documents, auth links, storage, improved tenant RLS

-- ---------------------------------------------------------------------------
-- Notifications (per client)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read BOOLEAN NOT NULL DEFAULT FALSE,
  link TEXT,
  link_label TEXT,
  invoice_id TEXT,
  invoice_number TEXT,
  batch_id TEXT,
  batch_number TEXT,
  payment_id TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS notifications_client_id_idx ON notifications (client_id, timestamp DESC);

-- ---------------------------------------------------------------------------
-- Audit logs (platform-wide; admin read)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id TEXT NOT NULL DEFAULT 'system',
  user_name TEXT NOT NULL DEFAULT 'System',
  user_role TEXT NOT NULL DEFAULT 'System',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_name TEXT,
  description TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  changes JSONB,
  metadata JSONB,
  severity TEXT NOT NULL DEFAULT 'info',
  success BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Client document vault (files in storage bucket)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS client_documents (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  category TEXT NOT NULL,
  document_type TEXT NOT NULL,
  notes TEXT,
  size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  storage_path TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS client_documents_client_id_idx ON client_documents (client_id, uploaded_at DESC);

-- ---------------------------------------------------------------------------
-- Links Supabase Auth users to Credyx clients
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS client_auth_links (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_auth_links_client_id_idx ON client_auth_links (client_id);

CREATE OR REPLACE FUNCTION credyx_apply_client_auth_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('client_id', NEW.client_id)
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS credyx_client_auth_link_applied ON client_auth_links;
CREATE TRIGGER credyx_client_auth_link_applied
  AFTER INSERT ON client_auth_links
  FOR EACH ROW EXECUTE FUNCTION credyx_apply_client_auth_link();

-- Resolve client_id from JWT app_metadata OR auth link table
CREATE OR REPLACE FUNCTION credyx_current_client_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'client_id', ''),
    (SELECT client_id FROM public.client_auth_links WHERE user_id = auth.uid() LIMIT 1)
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS for new tables
-- ---------------------------------------------------------------------------

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_auth_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credyx_notifications_tenant ON notifications;
CREATE POLICY credyx_notifications_tenant ON notifications
  FOR ALL TO anon, authenticated
  USING (credyx_can_access_client(client_id))
  WITH CHECK (credyx_can_access_client(client_id));

DROP POLICY IF EXISTS credyx_audit_logs_read ON audit_logs;
CREATE POLICY credyx_audit_logs_read ON audit_logs
  FOR SELECT TO anon, authenticated
  USING (credyx_is_admin() OR credyx_auth_not_configured());

DROP POLICY IF EXISTS credyx_audit_logs_insert ON audit_logs;
CREATE POLICY credyx_audit_logs_insert ON audit_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (credyx_is_admin() OR credyx_auth_not_configured() OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS credyx_client_documents_tenant ON client_documents;
CREATE POLICY credyx_client_documents_tenant ON client_documents
  FOR ALL TO anon, authenticated
  USING (credyx_can_access_client(client_id))
  WITH CHECK (credyx_can_access_client(client_id));

DROP POLICY IF EXISTS credyx_client_auth_links_select ON client_auth_links;
CREATE POLICY credyx_client_auth_links_select ON client_auth_links
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR credyx_is_admin() OR credyx_auth_not_configured());

DROP POLICY IF EXISTS credyx_client_auth_links_insert ON client_auth_links;
CREATE POLICY credyx_client_auth_links_insert ON client_auth_links
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage bucket for client documents
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-documents',
  'client-documents',
  FALSE,
  52428800,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS credyx_storage_client_docs_select ON storage.objects;
CREATE POLICY credyx_storage_client_docs_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      credyx_is_admin()
      OR credyx_auth_not_configured()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );

DROP POLICY IF EXISTS credyx_storage_client_docs_insert ON storage.objects;
CREATE POLICY credyx_storage_client_docs_insert ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND (
      credyx_is_admin()
      OR credyx_auth_not_configured()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );

DROP POLICY IF EXISTS credyx_storage_client_docs_delete ON storage.objects;
CREATE POLICY credyx_storage_client_docs_delete ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      credyx_is_admin()
      OR credyx_auth_not_configured()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );
