-- Batch invoice paperwork storage + document paths on invoices

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS document_storage_paths JSONB;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'batch-documents',
  'batch-documents',
  FALSE,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS credyx_storage_batch_docs_select ON storage.objects;
CREATE POLICY credyx_storage_batch_docs_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'batch-documents'
    AND (
      credyx_is_admin()
      OR credyx_auth_not_configured()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );

DROP POLICY IF EXISTS credyx_storage_batch_docs_insert ON storage.objects;
CREATE POLICY credyx_storage_batch_docs_insert ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'batch-documents'
    AND (
      credyx_is_admin()
      OR credyx_auth_not_configured()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );

DROP POLICY IF EXISTS credyx_storage_batch_docs_delete ON storage.objects;
CREATE POLICY credyx_storage_batch_docs_delete ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (
    bucket_id = 'batch-documents'
    AND (
      credyx_is_admin()
      OR credyx_auth_not_configured()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
    )
  );
