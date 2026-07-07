-- Production RLS: remove anon bypass, tighten tenant isolation.
-- Enrollment still works: anon may INSERT clients; authenticated users link via RPC.

-- credyx_can_access_client: admin OR matching client_id only (no anon bypass)
CREATE OR REPLACE FUNCTION credyx_can_access_client(row_client_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    credyx_is_admin()
    OR (
      credyx_current_client_id() IS NOT NULL
      AND row_client_id = credyx_current_client_id()
    );
$$;

-- Deprecate bypass — always false in production
CREATE OR REPLACE FUNCTION credyx_auth_not_configured()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT false;
$$;

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS credyx_clients_select ON clients;
CREATE POLICY credyx_clients_select ON clients
  FOR SELECT TO authenticated
  USING (
    credyx_is_admin()
    OR id = credyx_current_client_id()
  );

-- Enrollment: anon insert only (no read-back of other tenants)
DROP POLICY IF EXISTS credyx_clients_insert ON clients;
CREATE POLICY credyx_clients_insert ON clients
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    credyx_is_admin()
    OR auth.role() = 'anon'
    OR (auth.role() = 'authenticated' AND credyx_current_client_id() IS NULL)
  );

DROP POLICY IF EXISTS credyx_clients_update ON clients;
CREATE POLICY credyx_clients_update ON clients
  FOR UPDATE TO authenticated
  USING (
    credyx_is_admin()
    OR id = credyx_current_client_id()
  )
  WITH CHECK (
    credyx_is_admin()
    OR id = credyx_current_client_id()
  );

-- ---------------------------------------------------------------------------
-- batches / invoices / payments — tenant tables (authenticated only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS credyx_batches_tenant ON batches;
CREATE POLICY credyx_batches_tenant ON batches
  FOR ALL TO authenticated
  USING (credyx_can_access_client(client_id))
  WITH CHECK (credyx_can_access_client(client_id));

DROP POLICY IF EXISTS credyx_invoices_tenant ON invoices;
CREATE POLICY credyx_invoices_tenant ON invoices
  FOR ALL TO authenticated
  USING (credyx_can_access_client(client_id))
  WITH CHECK (credyx_can_access_client(client_id));

DROP POLICY IF EXISTS credyx_payments_tenant ON payments;
CREATE POLICY credyx_payments_tenant ON payments
  FOR ALL TO authenticated
  USING (credyx_can_access_client(client_id))
  WITH CHECK (credyx_can_access_client(client_id));

-- ---------------------------------------------------------------------------
-- brokers — read all authenticated; write admin or portal user adding broker
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS credyx_brokers_select ON brokers;
CREATE POLICY credyx_brokers_select ON brokers
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS credyx_brokers_write ON brokers;
CREATE POLICY credyx_brokers_write ON brokers
  FOR INSERT TO authenticated
  WITH CHECK (
    credyx_is_admin()
    OR credyx_current_client_id() IS NOT NULL
  );

DROP POLICY IF EXISTS credyx_brokers_update ON brokers;
CREATE POLICY credyx_brokers_update ON brokers
  FOR UPDATE TO authenticated
  USING (
    credyx_is_admin()
    OR credyx_current_client_id() IS NOT NULL
  )
  WITH CHECK (
    credyx_is_admin()
    OR credyx_current_client_id() IS NOT NULL
  );

DROP POLICY IF EXISTS credyx_brokers_delete ON brokers;
CREATE POLICY credyx_brokers_delete ON brokers
  FOR DELETE TO authenticated
  USING (credyx_is_admin());

-- ---------------------------------------------------------------------------
-- notifications / client_documents
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS credyx_notifications_tenant ON notifications;
CREATE POLICY credyx_notifications_tenant ON notifications
  FOR ALL TO authenticated
  USING (credyx_can_access_client(client_id))
  WITH CHECK (credyx_can_access_client(client_id));

DROP POLICY IF EXISTS credyx_client_documents_tenant ON client_documents;
CREATE POLICY credyx_client_documents_tenant ON client_documents
  FOR ALL TO authenticated
  USING (credyx_can_access_client(client_id))
  WITH CHECK (credyx_can_access_client(client_id));

-- ---------------------------------------------------------------------------
-- audit_logs — admin read; authenticated insert only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS credyx_audit_logs_read ON audit_logs;
CREATE POLICY credyx_audit_logs_read ON audit_logs
  FOR SELECT TO authenticated
  USING (credyx_is_admin());

DROP POLICY IF EXISTS credyx_audit_logs_insert ON audit_logs;
CREATE POLICY credyx_audit_logs_insert ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- client_auth_links
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS credyx_client_auth_links_select ON client_auth_links;
CREATE POLICY credyx_client_auth_links_select ON client_auth_links
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR credyx_is_admin());

-- ---------------------------------------------------------------------------
-- storage: client-documents bucket
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS credyx_storage_client_docs_select ON storage.objects;
CREATE POLICY credyx_storage_client_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      credyx_is_admin()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );

DROP POLICY IF EXISTS credyx_storage_client_docs_insert ON storage.objects;
CREATE POLICY credyx_storage_client_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND (
      credyx_is_admin()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );

DROP POLICY IF EXISTS credyx_storage_client_docs_delete ON storage.objects;
CREATE POLICY credyx_storage_client_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      credyx_is_admin()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );

-- ---------------------------------------------------------------------------
-- storage: batch-documents bucket
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS credyx_storage_batch_docs_select ON storage.objects;
CREATE POLICY credyx_storage_batch_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'batch-documents'
    AND (
      credyx_is_admin()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );

DROP POLICY IF EXISTS credyx_storage_batch_docs_insert ON storage.objects;
CREATE POLICY credyx_storage_batch_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'batch-documents'
    AND (
      credyx_is_admin()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );

DROP POLICY IF EXISTS credyx_storage_batch_docs_update ON storage.objects;
CREATE POLICY credyx_storage_batch_docs_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'batch-documents'
    AND (
      credyx_is_admin()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  )
  WITH CHECK (
    bucket_id = 'batch-documents'
    AND (
      credyx_is_admin()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );

DROP POLICY IF EXISTS credyx_storage_batch_docs_delete ON storage.objects;
CREATE POLICY credyx_storage_batch_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'batch-documents'
    AND (
      credyx_is_admin()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );
