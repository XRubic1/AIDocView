-- How Credyx confirms a rate with this broker. Web skips the verification email.
ALTER TABLE brokers
  ADD COLUMN IF NOT EXISTS verification_type TEXT NOT NULL DEFAULT 'email'
    CHECK (verification_type IN ('email', 'phone', 'web'));

COMMENT ON COLUMN brokers.verification_type IS
  'email | phone | web — how Credyx confirms the rate. web does not send a verification email.';

ALTER TABLE brokers
  ADD COLUMN IF NOT EXISTS verification_website_id TEXT;

COMMENT ON COLUMN brokers.verification_website_id IS
  'Id of a site from platform_settings.verification_websites. Used when verification_type is web.';
