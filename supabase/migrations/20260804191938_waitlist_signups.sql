-- Public waitlist leads (marketing site). Anon can insert; only admins can read/manage.
CREATE TABLE IF NOT EXISTS waitlist_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text,
  fleet_size text NOT NULL,
  hear_about text,
  notes text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'converted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique email so re-submits don't spam the table.
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_email_lower_idx
  ON waitlist_signups (lower(email));

CREATE INDEX IF NOT EXISTS waitlist_signups_created_at_idx
  ON waitlist_signups (created_at DESC);

ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waitlist_signups_anon_insert ON waitlist_signups;
CREATE POLICY waitlist_signups_anon_insert ON waitlist_signups
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS waitlist_signups_admin_select ON waitlist_signups;
CREATE POLICY waitlist_signups_admin_select ON waitlist_signups
  FOR SELECT TO authenticated
  USING (credyx_is_admin());

DROP POLICY IF EXISTS waitlist_signups_admin_update ON waitlist_signups;
CREATE POLICY waitlist_signups_admin_update ON waitlist_signups
  FOR UPDATE TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

DROP POLICY IF EXISTS waitlist_signups_admin_delete ON waitlist_signups;
CREATE POLICY waitlist_signups_admin_delete ON waitlist_signups
  FOR DELETE TO authenticated
  USING (credyx_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON waitlist_signups TO authenticated;
GRANT INSERT ON waitlist_signups TO anon;

-- Admin alert when someone joins the waitlist (editable in Settings → Email templates).
INSERT INTO email_templates (id, name, description, audience, placeholders, subject, body_html)
VALUES (
  'waitlist_signup_alert',
  'Admin — waitlist signup',
  'Notifies Credyx ops when a carrier joins the waitlist.',
  'admin',
  'companyName, contactName, email, phone, fleetSize, hearAbout, notes',
  'New waitlist signup — {{companyName}}',
  $html$<p>A carrier joined the waitlist:</p>
<ul>
  <li><strong>Company:</strong> {{companyName}}</li>
  <li><strong>Contact:</strong> {{contactName}}</li>
  <li><strong>Email:</strong> {{email}}</li>
  <li><strong>Phone:</strong> {{phone}}</li>
  <li><strong>Fleet size:</strong> {{fleetSize}}</li>
  <li><strong>Heard about us:</strong> {{hearAbout}}</li>
</ul>
<p><strong>Notes:</strong></p>
<pre style="white-space:pre-wrap;font-family:sans-serif">{{notes}}</pre>
<p>Review leads in Supabase → waitlist_signups (admin UI coming later).</p>$html$
)
ON CONFLICT (id) DO NOTHING;
