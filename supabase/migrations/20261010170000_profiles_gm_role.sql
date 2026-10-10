-- GM-роль для daily-дайджеста (bot gmDigestTick). as of 2026-10-10
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['user','admin','gm']));
