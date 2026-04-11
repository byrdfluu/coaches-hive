create table if not exists athlete_sub_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sport text not null default 'General',
  created_at timestamptz not null default now()
);

alter table athlete_sub_profiles enable row level security;

create policy "athlete_sub_profiles_select" on athlete_sub_profiles
  for select using (auth.uid() = user_id);

create policy "athlete_sub_profiles_insert" on athlete_sub_profiles
  for insert with check (auth.uid() = user_id);

create policy "athlete_sub_profiles_update" on athlete_sub_profiles
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "athlete_sub_profiles_delete" on athlete_sub_profiles
  for delete using (auth.uid() = user_id);
