-- Short payment corrections linked to a parent payment (wrong amount / chargeback)

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS parent_payment_id text REFERENCES payments(id),
  ADD COLUMN IF NOT EXISTS payment_kind text NOT NULL DEFAULT 'normal'
    CHECK (payment_kind IN ('normal', 'short', 'over')),
  ADD COLUMN IF NOT EXISTS short_pay_reason text
    CHECK (short_pay_reason IS NULL OR short_pay_reason IN ('wrong_amount', 'chargeback'));

CREATE INDEX IF NOT EXISTS idx_payments_parent_payment_id ON payments(parent_payment_id);
