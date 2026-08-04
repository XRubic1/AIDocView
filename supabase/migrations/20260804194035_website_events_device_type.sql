-- Log whether waitlist interactions came from mobile or desktop.
ALTER TABLE website_events
  ADD COLUMN IF NOT EXISTS device_type text;

ALTER TABLE website_events
  DROP CONSTRAINT IF EXISTS website_events_device_type_check;

ALTER TABLE website_events
  ADD CONSTRAINT website_events_device_type_check
  CHECK (device_type IS NULL OR device_type IN ('mobile', 'desktop'));

CREATE INDEX IF NOT EXISTS website_events_device_type_idx
  ON website_events (device_type);
