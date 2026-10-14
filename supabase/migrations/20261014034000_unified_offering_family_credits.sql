begin;

-- Family discovery must expose the canonical pricing contract. The previous
-- function predated unified offerings and silently dropped these columns.
drop function if exists public.assigned_org_programs_for_athlete(uuid);
create function public.assigned_org_programs_for_athlete(p_athlete_id uuid)
returns table(
  id uuid, org_id uuid, name text, type text, description text, start_date date,
  end_date date, price numeric, capacity integer, location text, status text,
  coach_id uuid, created_at timestamptz, fulfillment_mode text,
  price_per_occurrence numeric, credits_per_period integer, billing_type text,
  billing_interval text, cancellation_cutoff_hours integer,
  credit_expiration_days integer, credit_reset_policy text
)
language sql stable security definer set search_path=public as $$
  select p.id,p.org_id,p.name,p.type,p.description,p.start_date,p.end_date,p.price,
    p.capacity,p.location,p.status,p.coach_id,p.created_at,p.fulfillment_mode,
    p.price_per_occurrence,p.credits_per_period,p.billing_type,p.billing_interval,
    p.cancellation_cutoff_hours,p.credit_expiration_days,p.credit_reset_policy
  from public.programs p
  join public.organizations o on o.id=p.org_id
  where public.owns_athlete_profile(p_athlete_id)
    and p.status='active'
    and coalesce(o.is_test,false)=false
    and coalesce(o.status,'active')='active'
    and not exists(
      select 1 from public.business_workspaces w
      where w.organization_id=o.id and w.workspace_type='organization' and w.is_test=true
    )
    and public.is_org_program_visible(p.id,p_athlete_id)
  order by p.start_date asc nulls last;
$$;
revoke all on function public.assigned_org_programs_for_athlete(uuid) from public,anon;
grant execute on function public.assigned_org_programs_for_athlete(uuid) to authenticated;

-- A one-time credit product is activated only by the trusted payment backend
-- (or immediately for a free product). The registration ID is the stable,
-- idempotent cycle key so webhook retries cannot grant credits twice.
create or replace function public.activate_one_time_org_offering_credit_pack(
  p_registration_id uuid,
  p_period_start timestamptz default now()
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_registration public.program_registrations%rowtype;
  v_program public.programs%rowtype;
  v_membership uuid;
  v_period_end timestamptz;
begin
  if auth.role()<>'service_role' and not public.is_admin(auth.uid()) then
    raise exception 'Payment backend authorization required' using errcode='42501';
  end if;
  select * into v_registration from public.program_registrations
    where id=p_registration_id and status='paid' for update;
  if v_registration.id is null then raise exception 'Paid registration not found'; end if;
  select * into v_program from public.programs where id=v_registration.program_id;
  if v_program.fulfillment_mode<>'credit_membership' or v_program.billing_type<>'one_time' then
    raise exception 'Registration is not a one-time credit product';
  end if;
  v_period_end:=p_period_start+make_interval(days=>coalesce(v_program.credit_expiration_days,365));
  select id into v_membership from public.org_offering_credit_memberships
    where offering_id=v_program.id and athlete_id=v_registration.athlete_profile_id
      and status in ('pending','active','past_due') order by created_at desc limit 1 for update;
  if v_membership is null then
    insert into public.org_offering_credit_memberships(
      org_id,offering_id,athlete_id,purchaser_user_id,status
    ) values(
      v_program.org_id,v_program.id,v_registration.athlete_profile_id,
      v_registration.owner_user_id,'pending'
    ) returning id into v_membership;
  end if;
  perform public.activate_org_offering_credit_cycle(
    v_membership,'one-time:'||p_registration_id::text,p_period_start,v_period_end,null
  );
  return v_membership;
end $$;
revoke all on function public.activate_one_time_org_offering_credit_pack(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.activate_one_time_org_offering_credit_pack(uuid,timestamptz) to service_role;

notify pgrst,'reload schema';
commit;
