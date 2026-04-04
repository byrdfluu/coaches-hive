create table if not exists public.athlete_plans (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  tier text not null check (tier in ('explore', 'train', 'family')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.athlete_plans enable row level security;

drop policy if exists "athlete plans select" on public.athlete_plans;
create policy "athlete plans select" on public.athlete_plans
  for select using (athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "athlete plans insert" on public.athlete_plans;
create policy "athlete plans insert" on public.athlete_plans
  for insert with check (athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "athlete plans update" on public.athlete_plans;
create policy "athlete plans update" on public.athlete_plans
  for update using (athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin')
  with check (athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');
