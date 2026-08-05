-- Allow invoices without an automatic due date when broker Due by is 0.
ALTER TABLE invoices
  ALTER COLUMN due_date DROP NOT NULL,
  ALTER COLUMN expected_payment_date DROP NOT NULL;
