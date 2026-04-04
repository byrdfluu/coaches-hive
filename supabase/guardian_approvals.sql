create table if not exists public.guardian_approvals (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  guardian_user_id uuid references public.profiles(id) on delete set null,
  guardian_name text,
  guardian_email text,
  guardian_phone text,
  target_type text not null check (target_type in ('coach', 'org', 'team')),
  target_id uuid not null,
  target_label text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'expired')),
  approval_token text not null unique,
  expires_at timestamptz,
  requested_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  notification_channels jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.guardian_approvals add column if not exists scope text;
update public.guardian_approvals
set scope = 'messages'
where scope is null or btrim(scope) = '';
alter table public.guardian_approvals alter column scope set default 'messages';
alter table public.guardian_approvals alter column scope set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'guardian_approvals_scope_check'
      and conrelid = 'public.guardian_approvals'::regclass
  ) then
    alter table public.guardian_approvals
      add constraint guardian_approvals_scope_check
      check (scope in ('messages', 'transactions'));
  end if;
end
$$;

create index if not exists guardian_approvals_athlete_idx on public.guardian_approvals(athlete_id);
create index if not exists guardian_approvals_guardian_idx on public.guardian_approvals(guardian_user_id);
create index if not exists guardian_approvals_status_idx on public.guardian_approvals(status);
create index if not exists guardian_approvals_target_idx on public.guardian_approvals(target_type, target_id);
create index if not exists guardian_approvals_scope_idx on public.guardian_approvals(scope, athlete_id, target_type, target_id, status);

alter table public.guardian_approvals enable row level security;

drop policy if exists "guardian_approvals select" on public.guardian_approvals;
create policy "guardian_approvals select" on public.guardian_approvals
  for select
  using (
    public.is_admin()
    or athlete_id = auth.uid()
    or guardian_user_id = auth.uid()
    or guardian_email = coalesce(auth.jwt() ->> 'email', '')
  );

drop policy if exists "guardian_approvals insert" on public.guardian_approvals;
create policy "guardian_approvals insert" on public.guardian_approvals
  for insert
  with check (
    public.is_admin()
    or athlete_id = auth.uid()
  );

drop policy if exists "guardian_approvals update" on public.guardian_approvals;
create policy "guardian_approvals update" on public.guardian_approvals
  for update
  using (
    public.is_admin()
    or guardian_user_id = auth.uid()
    or guardian_email = coalesce(auth.jwt() ->> 'email', '')
  )
  with check (
    public.is_admin()
    or guardian_user_id = auth.uid()
    or guardian_email = coalesce(auth.jwt() ->> 'email', '')
  );
