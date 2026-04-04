create table if not exists public.org_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  type text not null default 'team' check (type in ('team', 'compliance', 'staff')),
  team text not null default '',
  title text not null,
  body text not null default '',
  tags text[] not null default '{}',
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_notes_org_idx
  on public.org_notes(org_id, created_at desc);

alter table public.org_notes enable row level security;

drop policy if exists "org notes select" on public.org_notes;
create policy "org notes select" on public.org_notes
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.organization_memberships m
      where m.user_id = auth.uid()
        and m.org_id = org_notes.org_id
    )
  );

drop policy if exists "org notes insert" on public.org_notes;
create policy "org notes insert" on public.org_notes
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.organization_memberships m
      where m.user_id = auth.uid()
        and m.org_id = org_notes.org_id
        and m.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
    )
  );

drop policy if exists "org notes update" on public.org_notes;
create policy "org notes update" on public.org_notes
  for update using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

drop policy if exists "org notes delete" on public.org_notes;
create policy "org notes delete" on public.org_notes
  for delete using (author_id = auth.uid() or public.is_admin());
