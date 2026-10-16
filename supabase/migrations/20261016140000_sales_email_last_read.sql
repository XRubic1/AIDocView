-- When a sales conversation was last opened; replies after this count as new.
ALTER TABLE sales_email_threads ADD COLUMN IF NOT EXISTS last_read_at timestamptz NOT NULL DEFAULT now();
