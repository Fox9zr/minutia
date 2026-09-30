-- INTENT: tighten people_directory write access to admins only (review finding R1+R2).
-- Read stays for all authenticated (needed for owner matching); write requires profile role admin.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'people_directory' AND policyname = 'people_directory_write') THEN
    DROP POLICY people_directory_write ON public.people_directory;
  END IF;
  CREATE POLICY people_directory_write ON public.people_directory
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    );
END $$;
