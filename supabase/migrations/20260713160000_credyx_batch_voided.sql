-- Allow Credyx ops to void batches (remove from workflow without deleting history).
ALTER TYPE batch_status ADD VALUE IF NOT EXISTS 'voided';
