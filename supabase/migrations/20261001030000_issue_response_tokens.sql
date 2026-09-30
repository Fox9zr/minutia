-- INTENT: accept-loop for issues — tokenized no-login responses ("accepted" / propose new due date).
-- Mirrors guest_shares pattern (also used by brief route).
create table if not exists public.issue_response_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  issue_id uuid not null references public.issues(id) on delete cascade,
  issued_by uuid references public.profiles(id),
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.issue_response_tokens enable row level security;
exception when others then null;
end $$;

-- service-role only (kong anon has no access); public flow goes through API routes
do $$ begin
  if not exists (select 1 from pg_policies where tablename='issue_response_tokens' and policyname='irt_read_none') then
    create policy irt_read_none on public.issue_response_tokens
      for select to authenticated using (false);
  end if;
  if not exists (select 1 from pg_policies where tablename='issue_response_tokens' and policyname='irt_write_none') then
    create policy irt_write_none on public.issue_response_tokens
      for all to authenticated using (false) with check (false);
  end if;
end $$;

-- proposed date adjustments visible to issue viewers via RLS on issues (join not needed, stored on issues)
alter table public.issues
  add column if not exists proposed_due_date date,
  add column if not exists proposed_note text,
  add column if not exists accepted_at timestamptz;

create index if not exists irt_issue_idx on public.issue_response_tokens(issue_id);
