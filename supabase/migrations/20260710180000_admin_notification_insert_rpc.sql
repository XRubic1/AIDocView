-- Reliable client → Credyx admin notification inserts.
-- Direct upsert fails for clients (INSERT-only RLS; upsert needs SELECT/UPDATE).

CREATE OR REPLACE FUNCTION credyx_insert_admin_notification(
  p_id text,
  p_type text,
  p_title text,
  p_message text,
  p_timestamp timestamptz DEFAULT NOW(),
  p_read boolean DEFAULT FALSE,
  p_link text DEFAULT NULL,
  p_link_label text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authenticated clients/admins (or bootstrap) may create admin inbox rows.
  IF NOT (
    credyx_is_admin()
    OR credyx_auth_not_configured()
    OR auth.uid() IS NOT NULL
    OR credyx_current_client_id() IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'not authorized to create admin notifications';
  END IF;

  INSERT INTO admin_notifications (
    id, type, title, message, timestamp, read, link, link_label, metadata
  ) VALUES (
    p_id, p_type, p_title, p_message, COALESCE(p_timestamp, NOW()), COALESCE(p_read, FALSE),
    p_link, p_link_label, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE SET
    type = EXCLUDED.type,
    title = EXCLUDED.title,
    message = EXCLUDED.message,
    timestamp = EXCLUDED.timestamp,
    read = EXCLUDED.read,
    link = EXCLUDED.link,
    link_label = EXCLUDED.link_label,
    metadata = EXCLUDED.metadata;
END;
$$;

GRANT EXECUTE ON FUNCTION credyx_insert_admin_notification(
  text, text, text, text, timestamptz, boolean, text, text, jsonb
) TO anon, authenticated;
