
UPDATE issues SET status = 'resolved' WHERE status = 'under_review';
UPDATE issues SET status = 'in_progress' WHERE status = 'rework';

ALTER TABLE issues DROP COLUMN IF EXISTS review_deadline;
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_status_check;
ALTER TABLE issues ADD CONSTRAINT issues_status_check CHECK (status = ANY (ARRAY['open','assigned','accepted','in_progress','pending','under_review','resolved','dropped','cancelled']));

ALTER TABLE reminder_log DROP COLUMN IF EXISTS channel CASCADE;

DROP TABLE IF EXISTS tg_reminder_queue CASCADE;
DROP TABLE IF EXISTS tg_ack_pending CASCADE;
DROP TABLE IF EXISTS tg_update_log CASCADE;
DROP TABLE IF EXISTS tg_callback_refs CASCADE;
DROP TABLE IF EXISTS tg_fsm CASCADE;
DROP TABLE IF EXISTS tg_link_codes CASCADE;
DROP TABLE IF EXISTS tg_users CASCADE;
DROP TABLE IF EXISTS reminder_matrix CASCADE;

ALTER TABLE series DROP COLUMN IF EXISTS tg_allowed;
ALTER TABLE profiles DROP COLUMN IF EXISTS notify_channel;
