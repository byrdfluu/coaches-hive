-- Guardian invites
-- Guardians are created via invite only (never self-signup).
-- When an athlete registers with a guardian_email, a row is inserted here
-- and an email is sent to the guardian with a time-limited token link.

create table if not exists guardian_invites (
  id           uuid primary key default gen_random_uuid(),
  token        text unique not null,
  guardian_email text not null,
  athlete_id   uuid references profiles(id) on delete cascade,
  athlete_name text,
  status       text not null default 'pending',   -- pending | accepted | expired
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists guardian_invites_token_idx   on guardian_invites(token);
create index if not exists guardian_invites_email_idx   on guardian_invites(guardian_email);
create index if not exists guardian_invites_athlete_idx on guardian_invites(athlete_id);

-- Unique constraint used by upsert in signup route (re-send replaces old token)
create unique index if not exists guardian_invites_email_athlete_idx
  on guardian_invites(guardian_email, athlete_id);

-- RLS: only service-role (supabaseAdmin) writes to this table
alter table guardian_invites enable row level security;

-- No user-facing read/write — all access goes through API routes using supabaseAdmin
