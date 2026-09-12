-- Public discovery contract for authenticated athlete/guardian experiences.
-- Test records are excluded at the database boundary, not merely hidden by the UI.

create or replace function public.discover_public_coaches()
returns table (
  coach_id uuid,
  full_name text,
  sport text,
  bio text,
  location text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.sport, p.bio, p.location
  from public.profiles p
  join public.independent_coach_profiles cp on cp.coach_id = p.id
  where auth.uid() is not null
    and cp.is_active = true
    and coalesce(p.is_test, false) = false
    and coalesce(p.status, 'active') = 'active'
  order by p.full_name nulls last;
$$;

create or replace function public.discover_public_organizations()
returns table (
  id uuid,
  name text,
  sport_primary text,
  sports_additional text[],
  description text,
  city text,
  state text,
  zip_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    coalesce(nullif(s.org_name, ''), 'Organization'),
    o.sport_primary,
    coalesce(o.sports_additional, '{}'::text[]),
    s.description,
    o.city,
    o.state,
    o.zip_code
  from public.organizations o
  left join public.org_settings s on s.org_id = o.id
  where auth.uid() is not null
    and coalesce(o.is_test, false) = false
    and coalesce(o.status, 'active') = 'active'
  order by coalesce(nullif(s.org_name, ''), 'Organization');
$$;

revoke all on function public.discover_public_coaches() from public;
revoke all on function public.discover_public_organizations() from public;
grant execute on function public.discover_public_coaches() to authenticated;
grant execute on function public.discover_public_organizations() to authenticated;
