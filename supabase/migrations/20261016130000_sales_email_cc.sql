-- CC addresses on sales outreach messages.
ALTER TABLE sales_email_messages ADD COLUMN IF NOT EXISTS cc text[] NOT NULL DEFAULT '{}';
