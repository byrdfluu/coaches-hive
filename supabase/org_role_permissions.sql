create table if not exists public.org_role_permissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  role text not null,
  permissions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (org_id, role)
);

create index if not exists org_role_permissions_org_idx on public.org_role_permissions(org_id);

alter table public.org_role_permissions enable row level security;

create policy "org_role_permissions select" on public.org_role_permissions
  for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.organization_memberships m
      where m.org_id = org_role_permissions.org_id
        and m.user_id = auth.uid()
    )
  );

create policy "org_role_permissions upsert" on public.org_role_permissions
  for insert
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.organization_memberships m
      where m.org_id = org_role_permissions.org_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
    )
  );

create policy "org_role_permissions update" on public.org_role_permissions
  for update
  using (
    public.is_admin()
    or exists (
      select 1
      from public.organization_memberships m
      where m.org_id = org_role_permissions.org_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.organization_memberships m
      where m.org_id = org_role_permissions.org_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
    )
  );
