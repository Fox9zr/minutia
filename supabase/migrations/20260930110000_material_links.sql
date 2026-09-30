-- INTENT: Daiko/Kotrol extension — «Материалы»: named links (files in Yandex.Disk etc.)
-- attached to a meeting or an issue. Links only, no file storage (Phase 2 decision).
-- RLS mirrors issues/task_events policies via user_can_access_series/user_can_manage_series.

CREATE TABLE IF NOT EXISTS public.links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id   uuid        NOT NULL REFERENCES public.meeting_series(id) ON DELETE CASCADE,
  meeting_id  uuid        REFERENCES public.meetings(id) ON DELETE CASCADE,
  issue_id    uuid        REFERENCES public.issues(id) ON DELETE CASCADE,
  title       text        NOT NULL DEFAULT '',
  url         text        NOT NULL CHECK (url ~* '^https?://[^\s]+$'),
  created_by  text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((meeting_id IS NULL) <> (issue_id IS NULL))  -- exactly one target
);

CREATE INDEX IF NOT EXISTS idx_links_meeting ON public.links(meeting_id);
CREATE INDEX IF NOT EXISTS idx_links_issue   ON public.links(issue_id);
CREATE INDEX IF NOT EXISTS idx_links_series  ON public.links(series_id);

ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;

CREATE POLICY links_select_series_participant ON public.links
  FOR SELECT USING (public.user_can_access_series(series_id));

CREATE POLICY links_insert_series_participant ON public.links
  FOR INSERT WITH CHECK (public.user_can_manage_series(series_id));

CREATE POLICY links_update_series_participant ON public.links
  FOR UPDATE USING (public.user_can_manage_series(series_id))
  WITH CHECK (public.user_can_manage_series(series_id));

CREATE POLICY links_delete_series_manager ON public.links
  FOR DELETE USING (public.user_can_manage_series(series_id));
