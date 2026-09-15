-- Live progress for client PPW processing UI.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.batch_processing_jobs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
