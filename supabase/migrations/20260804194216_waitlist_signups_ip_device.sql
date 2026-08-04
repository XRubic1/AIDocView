-- Store visitor IP/region/device on waitlist leads so interactions can mark "Joined".
ALTER TABLE waitlist_signups
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS device_type text;

ALTER TABLE waitlist_signups
  DROP CONSTRAINT IF EXISTS waitlist_signups_device_type_check;

ALTER TABLE waitlist_signups
  ADD CONSTRAINT waitlist_signups_device_type_check
  CHECK (device_type IS NULL OR device_type IN ('mobile', 'desktop'));

CREATE INDEX IF NOT EXISTS waitlist_signups_ip_address_idx
  ON waitlist_signups (ip_address);
