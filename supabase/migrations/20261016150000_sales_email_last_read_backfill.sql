-- last_read_at defaulted to the migration time, hiding replies that arrived earlier.
-- Conversations still flagged unread count from when they started.
UPDATE sales_email_threads SET last_read_at = created_at WHERE unread = true;
