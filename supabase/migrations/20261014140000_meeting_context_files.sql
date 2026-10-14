-- Kontext files for meetings + improved transcript lifecycle + evidence confidence
-- Phase 08 (GSD T2, plan approved by Luna+Flash+DeepSeek rounds 1-11)

-- 1) meeting_context_files
CREATE TABLE IF NOT EXISTS public.meeting_context_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  source text NOT NULL CHECK (source IN ('chat_attachment','manual_upload','text_snippet')),
  storage_path text,
  extracted_text text,
  token_count int DEFAULT 0,
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','processing','ready','failed')),
  error_message text,
  is_enabled boolean NOT NULL DEFAULT true,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcf_meeting ON public.meeting_context_files(meeting_id);
CREATE INDEX IF NOT EXISTS idx_mcf_pending ON public.meeting_context_files(processing_status) WHERE processing_status IN ('pending','processing');

-- RLS same pattern as meetings (series participant access)
ALTER TABLE public.meeting_context_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mcf_select_series_participant ON public.meeting_context_files;
CREATE POLICY mcf_select_series_participant ON public.meeting_context_files FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_context_files.meeting_id AND public.user_can_access_series(m.series_id)));
DROP POLICY IF EXISTS mcf_insert_series_manager ON public.meeting_context_files;
CREATE POLICY mcf_insert_series_manager ON public.meeting_context_files FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_context_files.meeting_id AND public.user_can_manage_series(m.series_id)));
DROP POLICY IF EXISTS mcf_update_series_participant ON public.meeting_context_files;
CREATE POLICY mcf_update_series_participant ON public.meeting_context_files FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_context_files.meeting_id AND public.user_can_access_series(m.series_id)));
DROP POLICY IF EXISTS mcf_delete_series_manager ON public.meeting_context_files;
CREATE POLICY mcf_delete_series_manager ON public.meeting_context_files FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_context_files.meeting_id AND public.user_can_manage_series(m.series_id)));

-- 2) meetings: improved transcript lifecycle
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS transcript_improved text;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS transcript_improved_at timestamptz;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS transcript_improved_sources jsonb;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS transcript_improved_status text NOT NULL DEFAULT 'idle' CHECK (transcript_improved_status IN ('idle','processing','ready','failed'));
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS transcript_improved_error text;

-- 3) issues: evidence confidence (fail-closed), 3-step migration (no NULLs remain)
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS evidence_confidence text;
-- backfill: confirmed/closed -> high (already human-verified by Inna), everything else -> unverified
UPDATE public.issues SET evidence_confidence = CASE WHEN status IN ('resolved','cancelled','assigned','accepted','in_progress') THEN 'high' ELSE 'unverified' END WHERE evidence_confidence IS NULL;
ALTER TABLE public.issues ALTER COLUMN evidence_confidence SET NOT NULL;
ALTER TABLE public.issues ALTER COLUMN evidence_confidence SET DEFAULT 'unverified';
ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_evidence_confidence_check;
ALTER TABLE public.issues ADD CONSTRAINT issues_evidence_confidence_check CHECK (evidence_confidence IN ('high','reduced','unverified'));
