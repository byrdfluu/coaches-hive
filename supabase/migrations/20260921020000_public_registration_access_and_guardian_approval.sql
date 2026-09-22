create table if not exists public.registration_access_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists registration_access_tokens_email_idx
  on public.registration_access_tokens(lower(email), expires_at desc);

create table if not exists public.guardian_registration_approvals (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.org_enrollment_submissions(id) on delete cascade,
  guardian_name text not null,
  guardian_email text not null,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.registration_access_tokens enable row level security;
alter table public.guardian_registration_approvals enable row level security;
revoke all on public.registration_access_tokens, public.guardian_registration_approvals from anon, authenticated;
grant all on public.registration_access_tokens, public.guardian_registration_approvals to service_role;
