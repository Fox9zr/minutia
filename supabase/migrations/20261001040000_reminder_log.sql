-- INTENT: автоматические напоминания (GSD kotrol-reminders-auto v6): лог отправок с claim/fencing.
CREATE TABLE IF NOT EXISTS reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('due','repeat')),
  due_date_value DATE,
  send_date_msk DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Moscow')::date),
  recipient_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','failed_final','skipped_no_email','skipped_cancelled')),
  sent_at TIMESTAMPTZ,
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  claim_token UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_due_unique ON reminder_log (issue_id, due_date_value) WHERE kind = 'due';
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_repeat_unique ON reminder_log (issue_id, send_date_msk) WHERE kind = 'repeat';
CREATE INDEX IF NOT EXISTS idx_reminder_status_updated ON reminder_log (status, updated_at);
ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reminder_log_admin_all ON reminder_log;
CREATE POLICY reminder_log_admin_all ON reminder_log FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
