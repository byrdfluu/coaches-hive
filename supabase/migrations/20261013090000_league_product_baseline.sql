-- Standard league product baseline: competitions, flexible registration,
-- participation lifecycle, discounts, detailed venues, and brackets.

create table if not exists public.league_competitions (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid not null references public.league_seasons(id) on delete cascade, name text not null,
  format text not null default 'league' check (format in ('league','tournament','round_robin','knockout','showcase','other')),
  registration_modes text[] not null default array['individual']::text[], registration_opens_at timestamptz,
  registration_closes_at timestamptz, is_active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (league_id,season_id,name),
  check (registration_modes <@ array['individual','team','free_agent']::text[]), check (cardinality(registration_modes) > 0),
  check (registration_closes_at is null or registration_opens_at is null or registration_closes_at > registration_opens_at)
);

alter table public.league_divisions add column if not exists competition_id uuid references public.league_competitions(id) on delete set null;
alter table public.league_games add column if not exists competition_id uuid references public.league_competitions(id) on delete set null;
alter table public.league_fees add column if not exists competition_id uuid references public.league_competitions(id) on delete set null;
alter table public.league_registrations
  add column if not exists competition_id uuid references public.league_competitions(id) on delete restrict,
  add column if not exists division_id uuid references public.league_divisions(id) on delete set null,
  add column if not exists registration_type text not null default 'individual',
  add column if not exists eligibility_status text not null default 'pending',
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists original_amount_cents integer not null default 0,
  add column if not exists discount_amount_cents integer not null default 0,
  add column if not exists final_amount_cents integer generated always as (greatest(original_amount_cents-discount_amount_cents,0)) stored;
alter table public.league_registrations alter column org_id drop not null;
alter table public.league_registrations alter column athlete_id drop not null;
alter table public.league_registrations drop constraint if exists league_registrations_status_check;
alter table public.league_registrations drop constraint if exists league_registrations_league_id_season_id_athlete_id_key;
alter table public.league_registrations add constraint league_registrations_status_check check (status in ('draft','provisional','submitted','registered','approved','pending','eligible','ineligible','waitlisted','withdrawn','suspended'));
alter table public.league_registrations drop constraint if exists league_registration_subject_check;
alter table public.league_registrations add constraint league_registration_subject_check check ((registration_type='team' and team_id is not null) or (registration_type in ('individual','free_agent') and athlete_id is not null));
do $$ begin alter table public.league_registrations add constraint league_registration_type_check check (registration_type in ('individual','team','free_agent')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.league_registrations add constraint league_registration_eligibility_check check (eligibility_status in ('pending','incomplete','under_review','eligible','ineligible','expired')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.league_registrations add constraint league_registration_payment_check check (payment_status in ('not_required','unpaid','partial','paid','past_due','refunded','credited','waived')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.league_registrations add constraint league_registration_amounts_check check (original_amount_cents >= 0 and discount_amount_cents >= 0 and discount_amount_cents <= original_amount_cents); exception when duplicate_object then null; end $$;

create unique index if not exists league_registration_exact_unique on public.league_registrations(athlete_id,season_id,competition_id,coalesce(team_id,'00000000-0000-0000-0000-000000000000'::uuid)) where athlete_id is not null and competition_id is not null and status <> 'withdrawn';
create unique index if not exists league_team_registration_exact_unique on public.league_registrations(season_id,competition_id,team_id) where registration_type='team' and team_id is not null and competition_id is not null and status <> 'withdrawn';

alter table public.league_team_assignments add column if not exists participation_status text not null default 'registered';
do $$ begin alter table public.league_team_assignments add constraint league_team_participation_status_check check (participation_status in ('draft','provisional','submitted','registered','approved','waitlisted','withdrawn','suspended')); exception when duplicate_object then null; end $$;

create table if not exists public.league_discounts (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.leagues(id) on delete cascade,
  competition_id uuid references public.league_competitions(id) on delete cascade, code text, name text not null,
  discount_type text not null check (discount_type in ('fixed','percentage','early_registration','admin','team_volume','scholarship','complimentary')),
  amount_cents integer, percent_off numeric(5,2), starts_at timestamptz, expires_at timestamptz, redemption_limit integer,
  per_user_limit integer not null default 1, minimum_team_size integer, is_active boolean not null default true,
  created_at timestamptz not null default now(), check ((amount_cents is not null and amount_cents >= 0) <> (percent_off is not null and percent_off between 0 and 100)),
  check (expires_at is null or starts_at is null or expires_at > starts_at), unique nulls not distinct (league_id,code)
);
create table if not exists public.league_discount_redemptions (
  id uuid primary key default gen_random_uuid(), discount_id uuid not null references public.league_discounts(id) on delete restrict,
  registration_id uuid not null references public.league_registrations(id) on delete cascade, user_id uuid references public.profiles(id) on delete set null,
  original_amount_cents integer not null, discount_amount_cents integer not null, final_amount_cents integer not null,
  redeemed_at timestamptz not null default now(), unique (discount_id,registration_id),
  check (original_amount_cents >= 0 and discount_amount_cents >= 0 and final_amount_cents = original_amount_cents-discount_amount_cents)
);

alter table public.league_venues add column if not exists latitude numeric(9,6), add column if not exists longitude numeric(9,6),
  add column if not exists contact_name text, add column if not exists contact_phone text, add column if not exists contact_email text,
  add column if not exists parking_instructions text, add column if not exists entrance_instructions text, add column if not exists field_map_storage_path text;
create table if not exists public.league_venue_fields (
  id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.league_venues(id) on delete cascade,
  name text not null, surface text, indoor boolean not null default false, has_lighting boolean not null default false,
  accessibility_notes text, is_active boolean not null default true, unique (venue_id,name)
);
alter table public.league_games add column if not exists venue_field_id uuid references public.league_venue_fields(id) on delete set null;
alter table public.league_games add column if not exists arrival_at timestamptz;
create table if not exists public.league_bracket_entries (
  id uuid primary key default gen_random_uuid(), competition_id uuid not null references public.league_competitions(id) on delete cascade,
  division_id uuid references public.league_divisions(id) on delete cascade, round_number integer not null check (round_number > 0),
  slot_number integer not null check (slot_number > 0), game_id uuid references public.league_games(id) on delete set null,
  advances_to_entry_id uuid references public.league_bracket_entries(id) on delete set null, unique (competition_id,division_id,round_number,slot_number)
);

alter table public.league_competitions enable row level security;
alter table public.league_discounts enable row level security;
alter table public.league_discount_redemptions enable row level security;
alter table public.league_venue_fields enable row level security;
alter table public.league_bracket_entries enable row level security;
drop policy if exists league_competitions_read on public.league_competitions;
create policy league_competitions_read on public.league_competitions for select to authenticated using (public.user_has_league_context(league_id) or public.is_admin(auth.uid()));
drop policy if exists league_competitions_manage on public.league_competitions;
create policy league_competitions_manage on public.league_competitions for all to authenticated using (public.is_league_admin(league_id) or public.league_has_permission(league_id,'manage_seasons')) with check (public.is_league_admin(league_id) or public.league_has_permission(league_id,'manage_seasons'));
drop policy if exists league_discounts_manage on public.league_discounts;
create policy league_discounts_manage on public.league_discounts for all to authenticated using (public.is_league_admin(league_id) or public.league_has_permission(league_id,'manage_payments')) with check (public.is_league_admin(league_id) or public.league_has_permission(league_id,'manage_payments'));
drop policy if exists league_discounts_member_read on public.league_discounts;
create policy league_discounts_member_read on public.league_discounts for select to authenticated using (is_active and public.user_has_league_context(league_id));
drop policy if exists league_discount_redemptions_read on public.league_discount_redemptions;
create policy league_discount_redemptions_read on public.league_discount_redemptions for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.league_discounts d where d.id=discount_id and (public.is_league_admin(d.league_id) or public.league_has_permission(d.league_id,'manage_payments'))));
drop policy if exists league_venue_fields_read on public.league_venue_fields;
create policy league_venue_fields_read on public.league_venue_fields for select to authenticated using (exists(select 1 from public.league_venues v where v.id=venue_id and public.user_has_league_context(v.league_id)));
drop policy if exists league_venue_fields_manage on public.league_venue_fields;
create policy league_venue_fields_manage on public.league_venue_fields for all to authenticated using (exists(select 1 from public.league_venues v where v.id=venue_id and (public.is_league_admin(v.league_id) or public.league_has_permission(v.league_id,'manage_schedule')))) with check (exists(select 1 from public.league_venues v where v.id=venue_id and (public.is_league_admin(v.league_id) or public.league_has_permission(v.league_id,'manage_schedule'))));
drop policy if exists league_brackets_read on public.league_bracket_entries;
create policy league_brackets_read on public.league_bracket_entries for select to authenticated using (exists(select 1 from public.league_competitions c where c.id=competition_id and public.user_has_league_context(c.league_id)));
drop policy if exists league_brackets_manage on public.league_bracket_entries;
create policy league_brackets_manage on public.league_bracket_entries for all to authenticated using (exists(select 1 from public.league_competitions c where c.id=competition_id and (public.is_league_admin(c.league_id) or public.league_has_permission(c.league_id,'manage_schedule')))) with check (exists(select 1 from public.league_competitions c where c.id=competition_id and (public.is_league_admin(c.league_id) or public.league_has_permission(c.league_id,'manage_schedule'))));

create index if not exists league_competitions_season_idx on public.league_competitions(league_id,season_id,is_active);
create index if not exists league_registrations_competition_idx on public.league_registrations(league_id,competition_id,status,eligibility_status,payment_status);
create index if not exists league_discounts_active_idx on public.league_discounts(league_id,competition_id,is_active,expires_at);
grant select on public.league_competitions,public.league_venue_fields,public.league_bracket_entries to authenticated;
grant select on public.league_discounts,public.league_discount_redemptions to authenticated;
grant all on public.league_competitions,public.league_discounts,public.league_discount_redemptions,public.league_venue_fields,public.league_bracket_entries to service_role;

create or replace function public.submit_league_registration(p_competition_id uuid,p_registration_type text,p_athlete_id uuid default null,p_team_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare c league_competitions; v_org_id uuid; v_registration_id uuid; v_price integer:=0;
begin
  select * into c from league_competitions where id=p_competition_id and is_active;
  if c.id is null then raise exception 'Competition is unavailable'; end if;
  if not p_registration_type=any(c.registration_modes) then raise exception 'This registration path is not enabled'; end if;
  if c.registration_opens_at is not null and now()<c.registration_opens_at then raise exception 'Registration has not opened'; end if;
  if c.registration_closes_at is not null and now()>c.registration_closes_at then raise exception 'Registration is closed'; end if;
  if p_registration_type in ('individual','free_agent') then
    if p_athlete_id is null or not exists(select 1 from athlete_profiles ap where ap.id=p_athlete_id and (ap.owner_user_id=auth.uid() or exists(select 1 from family_members fm where fm.family_id=ap.family_id and fm.user_id=auth.uid() and fm.status='active'))) then raise exception 'You are not authorized to register this athlete'; end if;
  else
    if p_team_id is null then raise exception 'A team is required'; end if;
    select t.org_id into v_org_id from org_teams t where t.id=p_team_id and (exists(select 1 from organization_memberships om where om.org_id=t.org_id and om.user_id=auth.uid() and om.status='active' and om.role in ('owner','admin','director')) or exists(select 1 from org_team_coaches tc where tc.team_id=t.id and tc.coach_id=auth.uid()));
    if v_org_id is null then raise exception 'You are not authorized to register this team'; end if;
    if not exists(select 1 from league_organizations lo where lo.league_id=c.league_id and lo.org_id=v_org_id and lo.status='active') then raise exception 'The organization must join this league first'; end if;
  end if;
  select coalesce(max(f.amount_cents),0)::integer into v_price from league_fees f where f.league_id=c.league_id and f.season_id=c.season_id and (f.competition_id is null or f.competition_id=c.id) and f.status='active';
  insert into league_registrations(league_id,season_id,competition_id,org_id,team_id,athlete_id,registration_type,status,eligibility_status,payment_status,original_amount_cents)
  values(c.league_id,c.season_id,c.id,v_org_id,p_team_id,p_athlete_id,p_registration_type,'submitted','incomplete',case when v_price=0 then 'not_required' else 'unpaid' end,v_price) returning id into v_registration_id;
  insert into league_audit_events(league_id,actor_user_id,event_type,record_type,record_id,metadata) values(c.league_id,auth.uid(),'registration.submitted','league_registrations',v_registration_id,jsonb_build_object('registration_type',p_registration_type,'competition_id',c.id));
  return v_registration_id;
end $$;

create or replace function public.apply_league_discount(p_registration_id uuid,p_code text)
returns table(original_amount_cents integer,discount_amount_cents integer,final_amount_cents integer) language plpgsql security definer set search_path=public as $$
declare r league_registrations; d league_discounts; v_discount integer;
begin
  select * into r from league_registrations where id=p_registration_id;
  if r.id is null then raise exception 'Registration not found'; end if;
  if not (exists(select 1 from athlete_profiles ap where ap.id=r.athlete_id and ap.owner_user_id=auth.uid()) or exists(select 1 from organization_memberships om where om.org_id=r.org_id and om.user_id=auth.uid() and om.status='active') or public.is_league_admin(r.league_id) or public.league_has_permission(r.league_id,'manage_payments')) then raise exception 'Not authorized'; end if;
  select * into d from league_discounts where league_id=r.league_id and upper(code)=upper(btrim(p_code)) and is_active and (competition_id is null or competition_id=r.competition_id) and (starts_at is null or starts_at<=now()) and (expires_at is null or expires_at>now());
  if d.id is null then raise exception 'Discount code is invalid or unavailable'; end if;
  if d.redemption_limit is not null and (select count(*) from league_discount_redemptions where discount_id=d.id)>=d.redemption_limit then raise exception 'Discount redemption limit reached'; end if;
  if (select count(*) from league_discount_redemptions where discount_id=d.id and user_id=auth.uid())>=d.per_user_limit then raise exception 'Discount already used'; end if;
  v_discount:=least(r.original_amount_cents,coalesce(d.amount_cents,round(r.original_amount_cents*d.percent_off/100.0)::integer));
  update league_registrations set discount_amount_cents=v_discount where id=r.id;
  insert into league_discount_redemptions(discount_id,registration_id,user_id,original_amount_cents,discount_amount_cents,final_amount_cents) values(d.id,r.id,auth.uid(),r.original_amount_cents,v_discount,r.original_amount_cents-v_discount);
  return query select r.original_amount_cents,v_discount,r.original_amount_cents-v_discount;
end $$;

create or replace function public.set_league_registration_lifecycle(p_registration_id uuid,p_status text default null,p_eligibility_status text default null,p_payment_status text default null,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare r league_registrations;
begin
  select * into r from league_registrations where id=p_registration_id;
  if r.id is null or not (public.is_league_admin(r.league_id) or public.league_has_permission(r.league_id,'manage_registrations')) then raise exception 'Not authorized'; end if;
  update league_registrations set status=coalesce(p_status,status),eligibility_status=coalesce(p_eligibility_status,eligibility_status),payment_status=coalesce(p_payment_status,payment_status) where id=r.id;
  insert into league_audit_events(league_id,actor_user_id,event_type,record_type,record_id,metadata) values(r.league_id,auth.uid(),'registration.lifecycle_changed','league_registrations',r.id,jsonb_build_object('status',p_status,'eligibility_status',p_eligibility_status,'payment_status',p_payment_status,'reason',p_reason));
end $$;
revoke all on function public.submit_league_registration(uuid,text,uuid,uuid),public.apply_league_discount(uuid,text),public.set_league_registration_lifecycle(uuid,text,text,text,text) from public,anon;
grant execute on function public.submit_league_registration(uuid,text,uuid,uuid),public.apply_league_discount(uuid,text),public.set_league_registration_lifecycle(uuid,text,text,text,text) to authenticated;
