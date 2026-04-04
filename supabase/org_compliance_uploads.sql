create table if not exists public.org_compliance_uploads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_path text not null,
  file_name text,
  file_type text,
  file_size integer,
  created_at timestamptz not null default now()
);

create index if not exists org_compliance_uploads_org_id_idx
  on public.org_compliance_uploads(org_id);

alter table public.org_compliance_uploads enable row level security;

drop policy if exists "org compliance read" on public.org_compliance_uploads;
create policy "org compliance read" on public.org_compliance_uploads
for select using (
  (auth.jwt() ->> 'role') = 'admin'
  or exists (
    select 1
    from organization_memberships m
    where m.org_id = org_compliance_uploads.org_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','school_admin','athletic_director','team_manager')
  )
);

drop policy if exists "org compliance insert" on public.org_compliance_uploads;
create policy "org compliance insert" on public.org_compliance_uploads
for insert with check (
  exists (
    select 1
    from organization_memberships m
    where m.org_id = org_compliance_uploads.org_id
      and m.user_id = auth.uid()
      and m.role in ('org_admin','school_admin','athletic_director','team_manager')
  )
);
