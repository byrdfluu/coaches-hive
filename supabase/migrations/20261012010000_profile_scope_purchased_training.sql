-- Attribute marketplace training entitlements and exercise history to the
-- selected athlete persona. The payer remains orders.athlete_id.

alter table if exists public.orders
  add column if not exists athlete_profile_id uuid references public.athlete_profiles(id) on delete set null;

alter table if exists public.athlete_exercise_logs
  add column if not exists athlete_profile_id uuid references public.athlete_profiles(id) on delete cascade;

do $$
begin
  if to_regclass('public.athlete_profile_legacy_map') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'orders' and column_name = 'sub_profile_id'
     ) then
    update public.orders o
       set athlete_profile_id = map.athlete_profile_id
      from public.athlete_profile_legacy_map map
     where o.athlete_profile_id is null
       and o.sub_profile_id = map.legacy_sub_profile_id;
  end if;
end $$;

update public.orders o
   set athlete_profile_id = ap.id
  from public.athlete_profiles ap
 where o.athlete_profile_id is null
   and ap.owner_user_id = o.athlete_id
   and ap.is_primary = true
   and ap.status = 'active';

update public.athlete_exercise_logs log
   set athlete_profile_id = ap.id
  from public.athlete_profiles ap
 where log.athlete_profile_id is null
   and ap.owner_user_id = log.athlete_id
   and ap.is_primary = true
   and ap.status = 'active';

create index if not exists orders_athlete_profile_product_idx
  on public.orders(athlete_profile_id, product_id, status);
create index if not exists athlete_exercise_logs_profile_program_idx
  on public.athlete_exercise_logs(athlete_profile_id, program_id, logged_at desc);

alter table if exists public.athlete_exercise_logs enable row level security;

drop policy if exists "ael_athlete_all" on public.athlete_exercise_logs;
create policy "ael_athlete_all" on public.athlete_exercise_logs
  for all
  using (
    athlete_id = auth.uid()
    and (athlete_profile_id is null or public.owns_athlete_profile(athlete_profile_id))
  )
  with check (
    athlete_id = auth.uid()
    and athlete_profile_id is not null
    and public.owns_athlete_profile(athlete_profile_id)
  );

drop policy if exists "ael_coach_select" on public.athlete_exercise_logs;
create policy "ael_coach_select" on public.athlete_exercise_logs
  for select using (auth.uid() = coach_id);

comment on column public.orders.athlete_profile_id is
  'Athlete persona receiving the marketplace purchase; athlete_id remains the paying account.';
comment on column public.athlete_exercise_logs.athlete_profile_id is
  'Athlete persona whose training history contains this exercise log.';
