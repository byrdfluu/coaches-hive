begin;

alter table public.org_fees
  add column if not exists publication_status text not null default 'draft',
  add column if not exists published_at timestamptz;

alter table public.org_fees drop constraint if exists org_fees_publication_status_check;
alter table public.org_fees add constraint org_fees_publication_status_check
  check(publication_status in ('draft','published','archived'));

-- Existing fee templates intentionally remain draft. Direct assignments remain
-- payable and visible through their assignment; publication is explicit.
update public.org_fees set publication_status='draft' where publication_status is null;

create or replace function public.prepare_published_org_fee_assignment(
  p_user_id uuid,
  p_fee_id uuid,
  p_athlete_id uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_fee public.org_fees%rowtype;
  v_assignment uuid;
  v_workspace uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_fee_id::text||':'||p_athlete_id::text,0));
  select * into v_fee from public.org_fees where id=p_fee_id and publication_status='published' for share;
  if v_fee.id is null then raise exception 'fee_unavailable'; end if;
  if coalesce(v_fee.amount_cents,0)<=0 then raise exception 'fee_amount_invalid'; end if;
  if not exists(select 1 from public.athlete_profiles ap where ap.id=p_athlete_id and ap.status='active'
    and (ap.owner_user_id=p_user_id
      or exists(select 1 from public.family_subscription_athletes f where f.athlete_profile_id=ap.id and f.subscription_owner_id=p_user_id)
      or exists(select 1 from public.guardian_privacy_consents g where g.athlete_id=ap.id and g.guardian_user_id=p_user_id
        and g.guardian_identity_confirmed=true and g.coppa_consent_given=true))) then raise exception 'athlete_unavailable'; end if;
  if not exists(select 1 from public.athlete_organization_memberships m where m.athlete_id=p_athlete_id
    and m.org_id=v_fee.org_id and m.status='active') then raise exception 'athlete_ineligible'; end if;
  if v_fee.audience_type='team' and (v_fee.team_id is null or not exists(
    select 1 from public.org_team_members tm where tm.team_id=v_fee.team_id and tm.athlete_id=p_athlete_id
  )) then raise exception 'athlete_ineligible'; end if;
  if v_fee.audience_type not in ('all','team') then raise exception 'fee_requires_direct_assignment'; end if;

  select a.id into v_assignment from public.org_fee_assignments a
  where a.fee_id=p_fee_id and a.athlete_id=p_athlete_id
  order by case when a.status in ('unpaid','pending','failed','expired','processing','partial') then 0 else 1 end,a.created_at desc limit 1;
  if v_assignment is not null then return v_assignment; end if;
  select id into v_workspace from public.business_workspaces where workspace_type='organization'
    and organization_id=v_fee.org_id and status='active' limit 1;
  if v_workspace is null then raise exception 'workspace_unavailable'; end if;
  insert into public.org_fee_assignments(fee_id,athlete_id,org_id,workspace_id,status,amount,amount_cents,due_date)
  values(v_fee.id,p_athlete_id,v_fee.org_id,v_workspace,'unpaid',v_fee.amount,v_fee.amount_cents,v_fee.due_date)
  returning id into v_assignment;
  return v_assignment;
end $$;

revoke all on function public.prepare_published_org_fee_assignment(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_published_org_fee_assignment(uuid,uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
