-- Fix false "DOT already on list": empty mc_digits must not be globally unique.
-- Also keep one lead per real MC and per DOT.

DROP INDEX IF EXISTS sales_leads_mc_digits_uidx;
DROP INDEX IF EXISTS sales_leads_dot_number_uidx;

-- Real MC digits only (exclude '' and synthetic DOT:… keys from this index —
-- synthetic keys are unique by construction; empty should never be inserted now).
CREATE UNIQUE INDEX IF NOT EXISTS sales_leads_mc_digits_uidx
  ON sales_leads (mc_digits)
  WHERE mc_digits <> '' AND mc_digits NOT LIKE 'DOT:%';

CREATE UNIQUE INDEX IF NOT EXISTS sales_leads_dot_number_uidx
  ON sales_leads (dot_number)
  WHERE dot_number IS NOT NULL;

-- Synthetic DOT-only keys stay unique via this index.
CREATE UNIQUE INDEX IF NOT EXISTS sales_leads_synthetic_dot_uidx
  ON sales_leads (mc_digits)
  WHERE mc_digits LIKE 'DOT:%';
