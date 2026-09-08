-- Canonical web/iOS subscription catalog. Existing subscriptions are preserved
-- and legacy keys remain valid inputs to entitlement resolution.
alter table public.platform_subscriptions
  add column if not exists plan_type text,
  add column if not exists processing_fee_rate numeric(5,4) not null default 0.04;

alter table public.platform_subscriptions
  drop constraint if exists platform_subscriptions_plan_type_check;

-- Backfill only the new discriminator. Stored legacy tier keys remain untouched
-- and are normalized at entitlement-read time.
update public.platform_subscriptions
set plan_type = case
  when owner_type = 'coach' then 'team_starter'
  when owner_type = 'org' then case
    when tier in ('org_starter','standard','growth','org_growth') then 'growing_organization'
    else 'established_organization'
  end
end
where plan_type is null;

alter table public.platform_subscriptions
  add constraint platform_subscriptions_plan_type_check check (plan_type in (
    'individual_coach','organization','team_starter','growing_organization',
    'established_organization','league_enterprise'
  ));

alter table public.org_settings
  add column if not exists contract_team_limit integer,
  add column if not exists contract_staff_limit integer;

alter table public.org_settings drop constraint if exists org_settings_plan_check;
alter table public.org_settings add constraint org_settings_plan_check check (plan in (
  'organization','org_starter','org_growth','org_all_access',
  'standard','growth','enterprise','all_access',
  'growing_organization','established_organization','league_enterprise'
));

create or replace function public.org_entitlement_limits(p_org_id uuid)
returns table(plan_key text, team_limit integer, staff_limit integer)
language sql stable security definer set search_path=public as $$
  with chosen as (
    select coalesce(
      (select ps.tier from platform_subscriptions ps where ps.organization_id=p_org_id
       and ps.status in ('active','trialing') order by ps.updated_at desc limit 1),
      os.plan, 'growing_organization') raw_plan,
      os.contract_team_limit, os.contract_staff_limit
    from org_settings os where os.org_id=p_org_id
  ), normalized as (
    select case
      when raw_plan='org_starter' then 'growing_organization'
      when raw_plan in ('organization','org_growth','org_all_access') then 'established_organization'
      else raw_plan end plan_key, contract_team_limit, contract_staff_limit from chosen
  )
  select plan_key,
    case plan_key when 'growing_organization' then 6 when 'established_organization' then 15
      when 'league_enterprise' then contract_team_limit else 6 end,
    case plan_key when 'growing_organization' then 15 when 'established_organization' then 35
      when 'league_enterprise' then contract_staff_limit else 15 end
  from normalized;
$$;

create or replace function public.enforce_org_team_limit()
returns trigger language plpgsql security definer set search_path=public as $$
declare limits record; current_count integer;
begin
  select * into limits from org_entitlement_limits(new.org_id);
  select count(*) into current_count from org_teams where org_id=new.org_id and id<>coalesce(new.id,gen_random_uuid());
  if limits.team_limit is not null and current_count >= limits.team_limit then
    raise exception using errcode='P0001', message='upgrade_required',
      detail=json_build_object('resource','active_teams','plan_key',limits.plan_key,'limit',limits.team_limit,'current',current_count)::text;
  end if;
  return new;
end $$;

drop trigger if exists enforce_org_team_limit_trigger on public.org_teams;
create trigger enforce_org_team_limit_trigger before insert on public.org_teams
for each row execute function public.enforce_org_team_limit();

create or replace function public.enforce_org_staff_limit()
returns trigger language plpgsql security definer set search_path=public as $$
declare limits record; current_count integer;
begin
  if new.status not in ('active','invited') or new.role in ('athlete','guardian') then return new; end if;
  select * into limits from org_entitlement_limits(new.org_id);
  select count(*) into current_count from organization_memberships
    where org_id=new.org_id and status in ('active','invited') and role not in ('athlete','guardian')
      and id<>coalesce(new.id,gen_random_uuid());
  if limits.staff_limit is not null and current_count >= limits.staff_limit then
    raise exception using errcode='P0001', message='upgrade_required',
      detail=json_build_object('resource','staff','plan_key',limits.plan_key,'limit',limits.staff_limit,'current',current_count)::text;
  end if;
  return new;
end $$;

drop trigger if exists enforce_org_staff_limit_trigger on public.organization_memberships;
create trigger enforce_org_staff_limit_trigger before insert or update of status,role on public.organization_memberships
for each row execute function public.enforce_org_staff_limit();
