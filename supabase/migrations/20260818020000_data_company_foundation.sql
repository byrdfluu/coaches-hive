-- Data-company foundation. Additive only: existing identities, payments, and memberships remain canonical.

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  primary_contact_id uuid references public.profiles(id) on delete set null,
  city text, state text, zip_code text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (state is null or state ~ '^[A-Z]{2}$'),
  check (zip_code is null or zip_code ~ '^[0-9]{5}$')
);
create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('parent','guardian','other')),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(), unique(family_id,user_id)
);

alter table if exists public.athlete_profiles
  add column if not exists family_id uuid references public.families(id) on delete set null,
  add column if not exists gender text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip_code text,
  add column if not exists coppa_consent_given boolean not null default false,
  add column if not exists coppa_consent_date timestamptz,
  add column if not exists coppa_consenting_parent_id uuid references public.profiles(id) on delete set null,
  add column if not exists duplicate_identity_confirmed boolean not null default false,
  add column if not exists status text not null default 'active';

create or replace function public.try_iso_date(value text) returns date language plpgsql immutable as $$
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return value::date;
exception when others then return null;
end;
$$;

alter table if exists public.athlete_profiles
  drop constraint if exists athlete_profiles_birth_date_youth_check,
  add constraint athlete_profiles_birth_date_youth_check check (birthdate is null or (public.try_iso_date(birthdate) < current_date and public.try_iso_date(birthdate) >= current_date - interval '25 years')) not valid,
  drop constraint if exists athlete_profiles_state_check,
  add constraint athlete_profiles_state_check check (state is null or state ~ '^[A-Z]{2}$') not valid,
  drop constraint if exists athlete_profiles_zip_check,
  add constraint athlete_profiles_zip_check check (zip_code is null or zip_code ~ '^[0-9]{5}$') not valid,
  drop constraint if exists athlete_profiles_status_check,
  add constraint athlete_profiles_status_check check (status in ('active','inactive','archived')) not valid,
  drop constraint if exists athlete_profiles_coppa_check,
  add constraint athlete_profiles_coppa_check check (
    birthdate is null or public.try_iso_date(birthdate) <= current_date - interval '13 years'
    or (coppa_consent_given and coppa_consent_date is not null and coppa_consenting_parent_id is not null)
  ) not valid;
create unique index if not exists athlete_profiles_family_identity_uidx on public.athlete_profiles(family_id,lower(full_name),birthdate)
  where family_id is not null and not duplicate_identity_confirmed and status<>'archived';

alter table if exists public.organizations
  add column if not exists sport_primary text,
  add column if not exists sports_additional text[] not null default '{}',
  add column if not exists competitive_level text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip_code text,
  add column if not exists region text,
  add column if not exists age_groups_served text[] not null default '{}',
  add column if not exists founded_year integer,
  add column if not exists org_size_coaches integer,
  add column if not exists org_size_players integer,
  add column if not exists status text not null default 'active';

alter table if exists public.organizations
  drop constraint if exists organizations_competitive_level_check,
  add constraint organizations_competitive_level_check check (competitive_level is null or competitive_level in ('recreational','travel','elite','mixed')) not valid,
  drop constraint if exists organizations_state_check,
  add constraint organizations_state_check check (state is null or state ~ '^[A-Z]{2}$') not valid,
  drop constraint if exists organizations_zip_check,
  add constraint organizations_zip_check check (zip_code is null or zip_code ~ '^[0-9]{5}$') not valid;

-- Durable participation rows replace season-specific duplicate athlete identities.
create table if not exists public.player_participations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.athlete_profiles(id) on delete restrict,
  team_id uuid not null references public.org_teams(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete restrict,
  season text, registration_date timestamptz not null default now(),
  registration_source text not null default 'manual' check (registration_source in ('direct_link','in_app','referral','manual')),
  referral_source_id uuid, fee_amount_cents integer not null default 0 check (fee_amount_cents >= 0),
  fee_type text check (fee_type is null or fee_type in ('early_bird','standard','late')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','partial','waived','refunded')),
  transaction_id uuid references public.payment_transactions(id) on delete set null,
  waivers_signed jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','withdrawn','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(player_id,team_id,season)
);

alter table public.payment_transactions
  add column if not exists family_id uuid references public.families(id) on delete set null,
  add column if not exists athlete_profile_id uuid references public.athlete_profiles(id) on delete set null,
  add column if not exists processing_fee_rate numeric(6,5) not null default 0.04,
  add column if not exists sport text,
  add column if not exists age_group text,
  add column if not exists is_off_platform boolean not null default false,
  add column if not exists recurring_schedule_id uuid,
  add column if not exists payment_sequence_number integer,
  add column if not exists refund_reason text;
update public.payment_transactions pt set athlete_profile_id=ap.id from public.athlete_profiles ap
where pt.athlete_profile_id is null and pt.player_id=ap.owner_user_id and ap.is_primary;
create index if not exists payment_transactions_athlete_date_idx on public.payment_transactions(athlete_profile_id,occurred_at desc);
update public.payment_transactions set processing_fee_rate=(metadata->>'processingFeeRate')::numeric
where metadata->>'processingFeeRate' ~ '^[0-9]+(\.[0-9]+)?$' and (metadata->>'processingFeeRate')::numeric between 0 and 0.10;
update public.payment_transactions set processing_fee_rate=(metadata->>'platformFeeRate')::numeric/100
where metadata->>'platformFeeRate' ~ '^[0-9]+(\.[0-9]+)?$' and (metadata->>'platformFeeRate')::numeric between 0 and 10;
update public.payment_transactions set processing_fee_rate=0 where is_off_platform or status='paid_off_platform';
alter table public.payment_transactions
  drop constraint if exists payment_transactions_fee_rate_check,
  add constraint payment_transactions_fee_rate_check check (processing_fee_rate between 0 and 0.10),
  drop constraint if exists payment_transactions_positive_amount_check,
  add constraint payment_transactions_positive_amount_check check (amount_cents > 0 or status in ('waived','canceled')) not valid;

alter table if exists public.org_enrollment_submissions
  add column if not exists coppa_consent_given boolean not null default false,
  add column if not exists coppa_consent_date timestamptz,
  add column if not exists coppa_consenting_guardian_name text,
  add column if not exists coppa_consenting_guardian_email text;

create table if not exists public.data_audit_log (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('create','update','delete','export','consent_given','consent_revoked','anonymize')),
  entity_type text not null, entity_id uuid, changes jsonb not null default '{}'::jsonb,
  ip_address inet, user_agent text
);
create index if not exists data_audit_entity_idx on public.data_audit_log(entity_type,entity_id,created_at desc);

create or replace function public.audit_player_consent_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.coppa_consent_given is distinct from new.coppa_consent_given then
    insert into public.data_audit_log(user_id,action,entity_type,entity_id,changes)
    values(auth.uid(),case when new.coppa_consent_given then 'consent_given' else 'consent_revoked' end,'player',new.id,
      jsonb_build_object('coppa_consent_given',jsonb_build_object('old',old.coppa_consent_given,'new',new.coppa_consent_given),'consent_date',new.coppa_consent_date));
  end if;
  return new;
end;
$$;
drop trigger if exists athlete_profile_consent_audit on public.athlete_profiles;
create trigger athlete_profile_consent_audit after update of coppa_consent_given on public.athlete_profiles
for each row execute function public.audit_player_consent_change();

create or replace function public.is_family_member(target_family_id uuid,target_user_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select target_user_id=auth.uid() and exists(select 1 from public.family_members where family_id=target_family_id and user_id=target_user_id and status='active')
$$;
revoke all on function public.is_family_member(uuid,uuid) from public,anon;
grant execute on function public.is_family_member(uuid,uuid) to authenticated,service_role;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.player_participations enable row level security;
alter table public.data_audit_log enable row level security;
create policy families_member_read on public.families for select using (primary_contact_id=auth.uid() or public.is_family_member(id,auth.uid()));
create policy family_members_family_read on public.family_members for select using (user_id=auth.uid() or public.is_family_member(family_id,auth.uid()));
create policy participation_family_or_org_read on public.player_participations for select using (
  exists(select 1 from public.athlete_profiles ap where ap.id=player_participations.player_id and ap.owner_user_id=auth.uid())
  or exists(select 1 from public.organization_memberships om where om.org_id=player_participations.org_id and om.user_id=auth.uid() and coalesce(om.status,'active')='active')
);
create policy audit_subject_read on public.data_audit_log for select using (user_id=auth.uid());
revoke insert,update,delete on public.families,public.family_members,public.player_participations,public.data_audit_log from authenticated,anon;
grant select on public.families,public.family_members,public.player_participations,public.data_audit_log to authenticated;
grant all on public.families,public.family_members,public.player_participations,public.data_audit_log to service_role;

create or replace view public.org_payment_summary with (security_invoker=true) as
with monthly as (
  select org_id,date_trunc('month',occurred_at) month,
    sum(amount_cents) filter(where status in ('succeeded','paid_off_platform'))::bigint total_payment_volume_cents,
    sum(platform_fee_cents) filter(where status='succeeded')::bigint total_platform_fees_cents,
    count(*) filter(where status in ('succeeded','paid_off_platform')) transaction_count,
    count(distinct payer_id) unique_payers,
    avg(amount_cents) filter(where status in ('succeeded','paid_off_platform'))::bigint avg_transaction_amount_cents
  from public.payment_transactions where org_id is not null group by org_id,date_trunc('month',occurred_at)
), types as (
  select org_id,date_trunc('month',occurred_at) month,
    jsonb_object_agg(transaction_type,total_cents) payment_type_breakdown_cents
  from (select org_id,date_trunc('month',occurred_at) month,transaction_type,sum(amount_cents)::bigint total_cents
    from public.payment_transactions where org_id is not null and status in ('succeeded','paid_off_platform')
    group by org_id,date_trunc('month',occurred_at),transaction_type) x group by org_id,month
)
select m.org_id,m.month,extract(year from m.month)::integer year,m.total_payment_volume_cents,m.total_platform_fees_cents,
  m.transaction_count,m.unique_payers,m.avg_transaction_amount_cents,coalesce(t.payment_type_breakdown_cents,'{}'::jsonb) payment_type_breakdown_cents
from monthly m left join types t on t.org_id=m.org_id and t.month=m.month;

create or replace view public.player_participation_history with (security_invoker=true) as
select pp.player_id,pp.org_id,pp.team_id,pt.sport,pp.season,pt.age_group,pp.registration_date,pp.status,
  coalesce(sum(tx.amount_cents) filter(where tx.status in ('succeeded','paid_off_platform')),0)::bigint total_paid_cents,
  (select count(distinct p2.season) from public.player_participations p2 where p2.player_id=pp.player_id and p2.org_id=pp.org_id) seasons_with_org,
  (select count(distinct p3.org_id) from public.player_participations p3 where p3.player_id=pp.player_id) total_orgs
from public.player_participations pp left join public.payment_transactions tx on tx.id=pp.transaction_id
left join public.payment_transactions pt on pt.id=pp.transaction_id
group by pp.player_id,pp.org_id,pp.team_id,pt.sport,pp.season,pt.age_group,pp.registration_date,pp.status;

create or replace view public.market_insights with (security_invoker=true) as
with base as (
  select coalesce(pt.sport,o.sport_primary) sport,o.region,o.state,o.competitive_level,pt.age_group,pt.transaction_type,
    pt.amount_cents,coalesce(pt.payment_method_brand,'unknown') payment_method_brand,o.org_size_players,o.org_size_coaches
  from public.payment_transactions pt join public.organizations o on o.id=pt.org_id where pt.status in ('succeeded','paid_off_platform')
), metrics as (
  select sport,region,state,competitive_level,age_group,
    avg(amount_cents) filter(where transaction_type='registration')::bigint avg_registration_fee_cents,
    avg(amount_cents) filter(where transaction_type='dues')::bigint avg_monthly_dues_cents,
    avg(amount_cents) filter(where transaction_type='event')::bigint avg_event_fee_cents,
    avg(org_size_players)::bigint avg_org_size_players,avg(org_size_coaches)::bigint avg_org_size_coaches
  from base group by sport,region,state,competitive_level,age_group
), methods as (
  select sport,region,state,competitive_level,age_group,jsonb_object_agg(payment_method_brand,method_count) payment_method_distribution
  from (select sport,region,state,competitive_level,age_group,payment_method_brand,count(*) method_count from base
    group by sport,region,state,competitive_level,age_group,payment_method_brand) x
  group by sport,region,state,competitive_level,age_group
)
select m.*,coalesce(p.payment_method_distribution,'{}'::jsonb) payment_method_distribution from metrics m
left join methods p on p.sport is not distinct from m.sport and p.region is not distinct from m.region and p.state is not distinct from m.state
  and p.competitive_level is not distinct from m.competitive_level and p.age_group is not distinct from m.age_group;

create or replace view public.org_health_metrics with (security_invoker=true) as
select o.id org_id,
  (select count(distinct pp.player_id) from public.player_participations pp where pp.org_id=o.id and pp.status='active') total_active_players,
  (select count(distinct om.user_id) from public.organization_memberships om where om.org_id=o.id and coalesce(om.status,'active')='active') total_active_coaches,
  (select count(*) from public.org_teams ot where ot.org_id=o.id) total_teams,
  greatest(0,extract(year from age(now(),o.created_at))*12+extract(month from age(now(),o.created_at)))::integer months_on_platform,
  coalesce((select sum(pt.amount_cents) from public.payment_transactions pt where pt.org_id=o.id and pt.status in ('succeeded','paid_off_platform')),0)::bigint total_lifetime_payment_volume_cents,
  coalesce((select avg(month_total)::bigint from (select sum(pt.amount_cents) month_total from public.payment_transactions pt where pt.org_id=o.id and pt.status in ('succeeded','paid_off_platform') group by date_trunc('month',pt.occurred_at)) m),0) avg_monthly_payment_volume_cents,
  coalesce((select avg(pp.fee_amount_cents)::bigint from public.player_participations pp where pp.org_id=o.id),0) avg_registration_fee_cents,
  coalesce((select count(*) filter(where pp.payment_status in ('paid','waived'))::numeric/nullif(count(*),0) from public.player_participations pp where pp.org_id=o.id),0) payment_collection_rate
from public.organizations o;

revoke all on public.market_insights from anon,authenticated;
grant select on public.org_payment_summary,public.player_participation_history,public.org_health_metrics to authenticated;
grant select on public.org_payment_summary,public.player_participation_history,public.org_health_metrics,public.market_insights to service_role;
