-- Allow reversal fee reimbursements on the credit ledger.

ALTER TABLE reimbursement_ledger
  DROP CONSTRAINT IF EXISTS reimbursement_ledger_credit_type_check;

ALTER TABLE reimbursement_ledger
  ADD CONSTRAINT reimbursement_ledger_credit_type_check
  CHECK (
    credit_type IN (
      'short_payment',
      'invoice_fee_reimbursement',
      'manual_discount',
      'reversal_fee_reimbursement'
    )
  );
