-- Credyx internal status while AI/admin must look at the packet (not a client hold).
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'review';
