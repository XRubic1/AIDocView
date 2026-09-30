-- Which admin-listed website to open when this broker is verified on the web.
ALTER TABLE brokers
  ADD COLUMN IF NOT EXISTS verification_website_id TEXT;

COMMENT ON COLUMN brokers.verification_website_id IS
  'Id of a site from platform_settings.verification_websites. Used when verification_type is web.';
