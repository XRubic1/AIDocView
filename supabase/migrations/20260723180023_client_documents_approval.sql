-- Vault document approval for carrier onboarding setup packets.

ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by_role TEXT NOT NULL DEFAULT 'admin';

-- Existing rows remain approved (default). Constrain status values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_documents_approval_status_check'
  ) THEN
    ALTER TABLE client_documents
      ADD CONSTRAINT client_documents_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_documents_uploaded_by_role_check'
  ) THEN
    ALTER TABLE client_documents
      ADD CONSTRAINT client_documents_uploaded_by_role_check
      CHECK (uploaded_by_role IN ('client', 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS client_documents_approval_status_idx
  ON client_documents (client_id, approval_status);
