-- Additive discovery support. No identities, memberships, or payments change.
alter table if exists public.organizations
  add column if not exists sport_primary text,
  add column if not exists sports_additional text[] not null default '{}',
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip_code text;

create index if not exists organizations_discovery_location_idx
  on public.organizations(status, state, city, zip_code);
create index if not exists organizations_discovery_sport_idx
  on public.organizations(lower(sport_primary));

-- Populate discovery sport from the first public-profile sport when missing.
update public.organizations o
set sport_primary = source.primary_sport,
    sports_additional = source.additional_sports
from (
  select os.org_id,
         nullif(trim(os.sports[1]), '') as primary_sport,
         case when cardinality(os.sports) > 1 then os.sports[2:] else '{}'::text[] end as additional_sports
  from public.org_settings os
  where cardinality(os.sports) > 0
) source
where o.id = source.org_id
  and o.sport_primary is null;

notify pgrst, 'reload schema';
