-- Distinguish uncollectable force-close (fees apply) from short-pay write-off (no fees).

ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'written_off';
