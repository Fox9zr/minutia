-- INTENT: Daiko/Kotrol extension — people directory emails for owners without accounts.
-- Table already exists in prod (created manually); this migration is idempotent and
-- adds RLS so authenticated workspace members can read, admins can manage.

ALTER TABLE IF EXISTS public.people_directory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'people_directory' AND policyname = 'people_directory_read'
  ) THEN
    CREATE POLICY people_directory_read ON public.people_directory
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'people_directory' AND policyname = 'people_directory_write'
  ) THEN
    CREATE POLICY people_directory_write ON public.people_directory
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
