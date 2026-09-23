-- Allow DOT-only leads: unique MC only when present; unique DOT when present.
DROP INDEX IF EXISTS sales_leads_mc_digits_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS sales_leads_mc_digits_uidx
  ON sales_leads (mc_digits)
  WHERE mc_digits <> '';

CREATE UNIQUE INDEX IF NOT EXISTS sales_leads_dot_number_uidx
  ON sales_leads (dot_number)
  WHERE dot_number IS NOT NULL;
