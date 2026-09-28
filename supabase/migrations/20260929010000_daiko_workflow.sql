-- INTENT: Daiko extension — workflow fields for accept-cycle, hold, and task split.
-- Nullable-only, no UI coupling yet (Phase 2). RLS mirrors issues policies.
-- 00004_daiko_workflow.sql

-- Accept-cycle fields (ответственный подтвердил формулировку/срок)
ALTER TABLE public.issues
  ADD COLUMN IF NOT EXISTS accepted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS proposed_due_date date,
  ADD COLUMN IF NOT EXISTS closed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by     text NOT NULL DEFAULT '',
  -- Hold («Приостановлено»): причина + дата возврата к рассмотрению
  ADD COLUMN IF NOT EXISTS hold_reason   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hold_until    date,
  -- Split-модель: 1 задача = 1 ответственный; совместные = подзадачи
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES public.issues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_issues_parent_task ON public.issues(parent_task_id);

-- task_events: история переходов (дешёвый лог, бесценен для accept-цикла Phase 2)
CREATE TABLE IF NOT EXISTS public.task_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id   uuid        NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  event      text        NOT NULL CHECK (event IN ('created','assigned','accepted','due_proposed','due_changed','status_changed','hold','resumed','closed','reopened','split','comment')),
  payload    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  actor      text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_events_issue ON public.task_events(issue_id, created_at);

-- RLS mirrors issues (via join to issues.series_id)
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_events_select_series_participant ON public.task_events
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.issues i
    WHERE i.id = task_events.issue_id AND user_can_access_series(i.series_id)));

CREATE POLICY task_events_insert_series_participant ON public.task_events
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.issues i
    WHERE i.id = task_events.issue_id AND user_can_access_series(i.series_id)));

CREATE POLICY task_events_update_series_participant ON public.task_events
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.issues i
    WHERE i.id = task_events.issue_id AND user_can_access_series(i.series_id)));

CREATE POLICY task_events_delete_series_manager ON public.task_events
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.issues i
    WHERE i.id = task_events.issue_id AND user_can_manage_series(i.series_id)));
