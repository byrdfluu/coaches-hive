begin;

alter table public.programs
  add column if not exists billing_type text not null default 'one_time',
  add column if not exists credit_expiration_days integer,
  add column if not exists credit_reset_policy text not null default 'expire_at_period_end',
  add column if not exists eligible_divisions text[] not null default '{}';
alter table public.programs drop constraint if exists programs_billing_type_check;
alter table public.programs add constraint programs_billing_type_check check(billing_type in ('one_time','recurring'));
alter table public.programs drop constraint if exists programs_credit_reset_policy_check;
alter table public.programs add constraint programs_credit_reset_policy_check check(credit_reset_policy in ('expire_at_period_end','fixed_validity'));
alter table public.programs drop constraint if exists programs_credit_terms_check;
alter table public.programs add constraint programs_credit_terms_check check(
  fulfillment_mode<>'credit_membership' or (
    credits_per_period is not null and credits_per_period>0 and
    ((billing_type='recurring' and billing_interval in ('month','year')) or
     (billing_type='one_time' and billing_interval is null and coalesce(credit_expiration_days,1)>0))
  )
);

create table if not exists public.org_offering_schedule_rules(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  offering_id uuid not null references public.programs(id) on delete cascade,
  weekday integer not null check(weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'UTC',
  location text,
  capacity integer check(capacity is null or capacity>0),
  coach_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  check(end_time>start_time)
);
alter table public.org_offering_schedule_rules enable row level security;
drop policy if exists org_offering_schedule_rules_read on public.org_offering_schedule_rules;
create policy org_offering_schedule_rules_read on public.org_offering_schedule_rules for select to authenticated
using(public.is_org_member(org_id) or public.is_admin(auth.uid()));

create table if not exists public.org_offering_creation_requests(
  request_id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  offering_id uuid not null references public.programs(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.org_offering_creation_requests enable row level security;
drop policy if exists org_offering_creation_requests_read on public.org_offering_creation_requests;
create policy org_offering_creation_requests_read on public.org_offering_creation_requests for select to authenticated
using(created_by=auth.uid() or public.is_org_member(org_id) or public.is_admin(auth.uid()));

create or replace function public.create_unified_org_offering(
  p_workspace_id uuid,p_org_id uuid,p_request_id uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_id uuid; v_existing uuid; v_type text; v_name text; v_mode text; v_billing text;
  v_audience text; v_status text; v_start date; v_end date; v_rule jsonb; v_occ jsonb;
  v_coaches uuid[]; v_teams uuid[]; v_athletes uuid[]; v_occ_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.business_workspaces w where w.id=p_workspace_id and w.organization_id=p_org_id and w.workspace_type='organization' and w.status='active')
    or not (public.is_org_director(p_org_id) or public.is_admin(auth.uid())) then
    raise exception 'Organization workspace access required' using errcode='42501';
  end if;
  select offering_id into v_existing from public.org_offering_creation_requests where request_id=p_request_id and org_id=p_org_id;
  if v_existing is not null then return jsonb_build_object('offering_id',v_existing,'reused',true); end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid offering request' using errcode='22023'; end if;

  v_type:=p_payload->>'type'; v_name:=trim(p_payload->>'name'); v_mode:=p_payload->>'fulfillment_mode';
  v_billing:=coalesce(p_payload->>'billing_type','one_time'); v_audience:=coalesce(p_payload->>'audience','organization');
  v_status:=coalesce(p_payload->>'status','draft'); v_start:=(p_payload->>'start_date')::date; v_end:=(p_payload->>'end_date')::date;
  v_coaches:=coalesce(array(select jsonb_array_elements_text(p_payload->'coach_ids')::uuid),'{}');
  v_teams:=coalesce(array(select jsonb_array_elements_text(p_payload->'team_ids')::uuid),'{}');
  v_athletes:=coalesce(array(select jsonb_array_elements_text(p_payload->'athlete_ids')::uuid),'{}');
  if v_type not in ('program','training_program','camp','clinic','tryout','course','academy','workshop','event','drop_in_session','session_pack','training_membership') then raise exception 'Choose a valid offering type' using errcode='22023'; end if;
  if nullif(v_name,'') is null then raise exception 'Name is required' using errcode='22023'; end if;
  if v_start is null or v_end is null or v_end<v_start then raise exception 'The end date must be on or after the start date' using errcode='22023'; end if;
  if v_mode not in ('free','series','per_occurrence','credit_membership') then raise exception 'Choose a valid pricing model' using errcode='22023'; end if;
  if v_audience not in ('organization','team','athlete') then raise exception 'Choose a valid registration audience' using errcode='22023'; end if;
  if v_audience='team' and cardinality(v_teams)=0 then raise exception 'Choose at least one team' using errcode='22023'; end if;
  if v_audience='athlete' and cardinality(v_athletes)=0 then raise exception 'Choose at least one athlete' using errcode='22023'; end if;
  if exists(select 1 from unnest(v_coaches)c where not exists(select 1 from public.organization_memberships m where m.org_id=p_org_id and m.user_id=c and m.status='active')) then raise exception 'A selected coach is unavailable' using errcode='22023'; end if;
  if v_status='active' and coalesce(jsonb_array_length(p_payload->'occurrences'),0)=0 then raise exception 'Add at least one date and time' using errcode='22023'; end if;

  insert into public.programs(org_id,name,type,description,location,start_date,end_date,status,price,capacity,
    fulfillment_mode,price_per_occurrence,credits_per_period,billing_type,billing_interval,renews_until_cancelled,
    cancellation_cutoff_hours,payment_plan_enabled,eligible_grades,eligible_divisions,credit_expiration_days,credit_reset_policy)
  values(p_org_id,v_name,v_type,nullif(trim(p_payload->>'description'),''),nullif(trim(p_payload->>'location'),''),v_start,v_end,
    case when v_status='active' then 'active' else 'draft' end,
    case when v_mode='free' then 0 else coalesce((p_payload->>'price')::numeric,0) end,
    nullif(p_payload->>'capacity','')::integer,v_mode,nullif(p_payload->>'price_per_occurrence','')::numeric,
    nullif(p_payload->>'credits_per_period','')::integer,v_billing,
    case when v_billing='recurring' then coalesce(p_payload->>'billing_interval','month') else null end,
    v_billing='recurring',coalesce((p_payload->>'cancellation_cutoff_hours')::integer,24),
    coalesce((p_payload->>'payment_plan_enabled')::boolean,false),
    coalesce(array(select jsonb_array_elements_text(p_payload->'eligible_grades')),'{}'),
    coalesce(array(select jsonb_array_elements_text(p_payload->'eligible_divisions')),'{}'),
    nullif(p_payload->>'credit_expiration_days','')::integer,
    case when v_billing='recurring' then 'expire_at_period_end' else 'fixed_validity' end)
  returning id into v_id;

  insert into public.org_program_targets(program_id,target_type)
    select v_id,'organization' where v_audience='organization';
  insert into public.org_program_targets(program_id,target_type,team_id)
    select v_id,'team',id from unnest(v_teams)id where v_audience='team';
  insert into public.org_program_targets(program_id,target_type,athlete_id)
    select v_id,'athlete',id from unnest(v_athletes)id where v_audience='athlete';
  insert into public.org_program_coaches(program_id,coach_id) select v_id,id from unnest(v_coaches)id;

  for v_rule in select value from jsonb_array_elements(coalesce(p_payload->'schedule_rules','[]')) loop
    insert into public.org_offering_schedule_rules(org_id,offering_id,weekday,start_time,end_time,timezone,location,capacity,coach_ids)
    values(p_org_id,v_id,(v_rule->>'weekday')::integer,(v_rule->>'start_time')::time,(v_rule->>'end_time')::time,
      coalesce(v_rule->>'timezone',p_payload->>'timezone','UTC'),nullif(trim(v_rule->>'location'),''),
      nullif(v_rule->>'capacity','')::integer,
      case when jsonb_typeof(v_rule->'coach_ids')='array' and jsonb_array_length(v_rule->'coach_ids')>0
        then array(select jsonb_array_elements_text(v_rule->'coach_ids')::uuid) else v_coaches end);
  end loop;
  for v_occ in select value from jsonb_array_elements(coalesce(p_payload->'occurrences','[]')) loop
    if (v_occ->>'ends_at')::timestamptz<=(v_occ->>'starts_at')::timestamptz then raise exception 'Every end time must be after its start time' using errcode='22023'; end if;
    insert into public.org_offering_occurrences(org_id,offering_type,offering_id,starts_at,ends_at,timezone,location,capacity,coach_ids,status)
    values(p_org_id,v_type,v_id,(v_occ->>'starts_at')::timestamptz,(v_occ->>'ends_at')::timestamptz,
      coalesce(v_occ->>'timezone',p_payload->>'timezone','UTC'),coalesce(nullif(trim(v_occ->>'location'),''),nullif(trim(p_payload->>'location'),'')),
      coalesce(nullif(v_occ->>'capacity','')::integer,nullif(p_payload->>'capacity','')::integer),
      case when jsonb_typeof(v_occ->'coach_ids')='array' and jsonb_array_length(v_occ->'coach_ids')>0
        then array(select jsonb_array_elements_text(v_occ->'coach_ids')::uuid) else v_coaches end,
      case when v_status='active' then 'published' else 'draft' end);
    v_occ_count:=v_occ_count+1;
  end loop;
  insert into public.org_offering_creation_requests(request_id,org_id,offering_id) values(p_request_id,p_org_id,v_id);
  return jsonb_build_object('offering_id',v_id,'status',case when v_status='active' then 'published' else 'draft' end,'occurrence_count',v_occ_count,'reused',false);
end $$;
revoke all on function public.create_unified_org_offering(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_unified_org_offering(uuid,uuid,uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
