-- Family-authorized athlete access without changing the athlete's canonical owner.
create or replace function public.my_accessible_athlete_profiles()
returns setof public.athlete_profiles
language sql stable security definer set search_path=public as $$
  select distinct ap.*
  from public.athlete_profiles ap
  where ap.owner_user_id=auth.uid()
     or (ap.family_id is not null and exists(
       select 1 from public.family_members fm
       where fm.family_id=ap.family_id and fm.user_id=auth.uid() and fm.status='active'))
  order by ap.is_primary desc,ap.created_at;
$$;
revoke all on function public.my_accessible_athlete_profiles() from public,anon;
grant execute on function public.my_accessible_athlete_profiles() to authenticated;

drop policy if exists athlete_profiles_family_authorized_read on public.athlete_profiles;
create policy athlete_profiles_family_authorized_read on public.athlete_profiles for select to authenticated using(
  family_id is not null and exists(select 1 from public.family_members fm
    where fm.family_id=athlete_profiles.family_id and fm.user_id=auth.uid() and fm.status='active')
);
