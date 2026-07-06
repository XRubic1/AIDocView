-- Allow ops uploads while authenticated; upsert needs UPDATE on storage.objects.

DROP POLICY IF EXISTS credyx_storage_batch_docs_update ON storage.objects;
CREATE POLICY credyx_storage_batch_docs_update ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (
    bucket_id = 'batch-documents'
    AND (
      credyx_is_admin()
      OR credyx_auth_not_configured()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
      OR auth.role() = 'authenticated'
    )
  )
  WITH CHECK (
    bucket_id = 'batch-documents'
    AND (
      credyx_is_admin()
      OR credyx_auth_not_configured()
      OR (storage.foldername(name))[1] = credyx_current_client_id()
      OR auth.role() = 'authenticated'
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
      OR auth.role() = 'authenticated'
    )
  );
