-- Cold-outreach sales leads (carrier MC lookup + chase grade).
CREATE TABLE IF NOT EXISTS sales_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mc_number text NOT NULL,
  mc_digits text NOT NULL,
  company_name text,
  dot_number integer,
  contact_phone text,
  contact_email text,
  officer text,
  phy_address text,
  operating_status text,
  add_date date,
  years_in_business numeric(6, 2),
  total_trucks integer,
  total_power_units integer,
  total_drivers integer,
  chase_grade text NOT NULL DEFAULT 'C'
    CHECK (chase_grade IN ('A', 'B', 'C', 'D', 'F')),
  grade_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot jsonb,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'researching', 'contacted', 'replied', 'converted', 'declined', 'skipped')),
  notes text,
  last_lookup_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One lead per MC (normalized digits).
CREATE UNIQUE INDEX IF NOT EXISTS sales_leads_mc_digits_uidx
  ON sales_leads (mc_digits);

CREATE INDEX IF NOT EXISTS sales_leads_chase_grade_idx
  ON sales_leads (chase_grade);

CREATE INDEX IF NOT EXISTS sales_leads_status_idx
  ON sales_leads (status);

CREATE INDEX IF NOT EXISTS sales_leads_created_at_idx
  ON sales_leads (created_at DESC);

ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_leads_admin_select ON sales_leads;
CREATE POLICY sales_leads_admin_select ON sales_leads
  FOR SELECT TO authenticated
  USING (credyx_is_admin());

DROP POLICY IF EXISTS sales_leads_admin_insert ON sales_leads;
CREATE POLICY sales_leads_admin_insert ON sales_leads
  FOR INSERT TO authenticated
  WITH CHECK (credyx_is_admin());

DROP POLICY IF EXISTS sales_leads_admin_update ON sales_leads;
CREATE POLICY sales_leads_admin_update ON sales_leads
  FOR UPDATE TO authenticated
  USING (credyx_is_admin())
  WITH CHECK (credyx_is_admin());

DROP POLICY IF EXISTS sales_leads_admin_delete ON sales_leads;
CREATE POLICY sales_leads_admin_delete ON sales_leads
  FOR DELETE TO authenticated
  USING (credyx_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON sales_leads TO authenticated;
