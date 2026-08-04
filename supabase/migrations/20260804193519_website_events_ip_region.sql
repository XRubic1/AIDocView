-- Capture approximate visitor IP + region on waitlist marketing events.
ALTER TABLE website_events
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS region text;

CREATE INDEX IF NOT EXISTS website_events_ip_address_idx
  ON website_events (ip_address);

CREATE INDEX IF NOT EXISTS website_events_region_idx
  ON website_events (region);
