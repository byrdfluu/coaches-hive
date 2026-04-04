create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'session' check (type in ('session', 'progress', 'staff')),
  athlete text not null default '',
  team text not null default '',
  title text not null,
  body text not null default '',
  tags text[] not null default '{}',
  shared boolean not null default false,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_notes_coach_idx
  on public.coach_notes(coach_id, created_at desc);

alter table public.coach_notes enable row level security;

drop policy if exists "coach notes select" on public.coach_notes;
create policy "coach notes select" on public.coach_notes
  for select using (coach_id = auth.uid() or public.is_admin());

drop policy if exists "coach notes insert" on public.coach_notes;
create policy "coach notes insert" on public.coach_notes
  for insert with check (coach_id = auth.uid());

drop policy if exists "coach notes update" on public.coach_notes;
create policy "coach notes update" on public.coach_notes
  for update using (coach_id = auth.uid() or public.is_admin())
  with check (coach_id = auth.uid() or public.is_admin());

drop policy if exists "coach notes delete" on public.coach_notes;
create policy "coach notes delete" on public.coach_notes
  for delete using (coach_id = auth.uid() or public.is_admin());
