-- Store inbound recipient on review rows (webhook often only has Resend catch address).
ALTER TABLE email_review_items
  ADD COLUMN IF NOT EXISTS to_address TEXT NOT NULL DEFAULT '';
