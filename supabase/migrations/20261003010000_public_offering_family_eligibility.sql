begin;

-- Public organization offerings are purchasable by any family-authorized
-- athlete. Organization roster membership is only relevant when an offering
-- is explicitly targeted to a team.
create or replace function public.is_org_program_visible(
  target_program_id uuid,
  target_athlete_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.programs p
    where p.id = target_program_id
      and (
        not exists (
          select 1 from public.org_program_targets any_target
          where any_target.program_id = p.id
        )
        or exists (
          select 1
          from public.org_program_targets target
          where target.program_id = p.id
            and (
              target.target_type = 'organization'
              or (target.target_type = 'athlete' and target.athlete_id = target_athlete_id)
              or (
                target.target_type = 'team'
                and exists (
                  select 1
                  from public.org_team_members team_member
                  join public.org_teams team on team.id = team_member.team_id
                  where team_member.team_id = target.team_id
                    and team_member.athlete_id = target_athlete_id
                    and team.org_id = p.org_id
                )
              )
            )
        )
      )
  );
$$;

revoke all on function public.is_org_program_visible(uuid, uuid) from public, anon;
grant execute on function public.is_org_program_visible(uuid, uuid) to authenticated;

create or replace function public.prepare_published_org_fee_assignment(
  p_user_id uuid,
  p_fee_id uuid,
  p_athlete_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee public.org_fees%rowtype;
  v_assignment uuid;
  v_workspace uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_fee_id::text || ':' || p_athlete_id::text, 0));

  select * into v_fee
  from public.org_fees
  where id = p_fee_id and publication_status = 'published'
  for share;

  if v_fee.id is null then raise exception 'fee_unavailable'; end if;
  if coalesce(v_fee.amount_cents, 0) <= 0 then raise exception 'fee_amount_invalid'; end if;

  if not exists (
    select 1
    from public.athlete_profiles athlete
    where athlete.id = p_athlete_id
      and athlete.status = 'active'
      and (
        athlete.owner_user_id = p_user_id
        or exists (
          select 1 from public.family_subscription_athletes family
          where family.athlete_profile_id = athlete.id
            and family.subscription_owner_id = p_user_id
        )
        or exists (
          select 1 from public.guardian_privacy_consents guardian
          where guardian.athlete_id = athlete.id
            and guardian.guardian_user_id = p_user_id
            and guardian.guardian_identity_confirmed = true
            and guardian.coppa_consent_given = true
        )
      )
  ) then
    raise exception 'athlete_unavailable';
  end if;

  if v_fee.audience_type = 'team' and (
    v_fee.team_id is null
    or not exists (
      select 1
      from public.org_team_members team_member
      join public.org_teams team on team.id = team_member.team_id
      where team_member.team_id = v_fee.team_id
        and team_member.athlete_id = p_athlete_id
        and team.org_id = v_fee.org_id
    )
  ) then
    raise exception 'athlete_ineligible';
  end if;

  if v_fee.audience_type not in ('all', 'team') then
    raise exception 'fee_requires_direct_assignment';
  end if;

  select assignment.id into v_assignment
  from public.org_fee_assignments assignment
  where assignment.fee_id = p_fee_id
    and assignment.athlete_id = p_athlete_id
  order by
    case when assignment.status in ('unpaid', 'pending', 'failed', 'expired', 'processing', 'partial') then 0 else 1 end,
    assignment.created_at desc
  limit 1;

  if v_assignment is not null then return v_assignment; end if;

  select workspace.id into v_workspace
  from public.business_workspaces workspace
  where workspace.workspace_type = 'organization'
    and workspace.organization_id = v_fee.org_id
    and workspace.status = 'active'
  limit 1;

  if v_workspace is null then raise exception 'workspace_unavailable'; end if;

  insert into public.org_fee_assignments(
    fee_id, athlete_id, org_id, workspace_id, status, amount, amount_cents, due_date
  ) values (
    v_fee.id, p_athlete_id, v_fee.org_id, v_workspace, 'unpaid', v_fee.amount, v_fee.amount_cents, v_fee.due_date
  )
  returning id into v_assignment;

  return v_assignment;
end;
$$;

revoke all on function public.prepare_published_org_fee_assignment(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_published_org_fee_assignment(uuid, uuid, uuid) to service_role;

create or replace function public.request_org_training_package_purchase(
  p_athlete_id uuid,
  p_package_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package public.org_training_packages%rowtype;
  v_existing public.org_training_package_purchases%rowtype;
  v_purchase_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to purchase a package'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_package_id::text || ':' || p_athlete_id::text, 0));

  select * into v_package
  from public.org_training_packages
  where id = p_package_id and status = 'published';

  if not found then raise exception 'This package is not available'; end if;

  if not exists (
    select 1
    from public.my_accessible_athlete_profiles() athlete
    where athlete.id = p_athlete_id
  ) then
    raise exception 'Choose an athlete profile you manage';
  end if;

  if v_package.billing_type = 'recurring' then
    select purchase.* into v_existing
    from public.org_training_package_purchases purchase
    where purchase.package_id = p_package_id
      and purchase.athlete_id = p_athlete_id
      and purchase.status in ('pending', 'active', 'past_due')
    order by purchase.created_at desc
    limit 1;

    if v_existing.id is not null then
      if v_existing.status = 'pending'
        and v_existing.purchaser_user_id <> auth.uid()
        and v_existing.stripe_checkout_session_id is null
        and v_existing.stripe_subscription_id is null then
        update public.org_training_package_purchases
        set purchaser_user_id = auth.uid(), updated_at = now()
        where id = v_existing.id;
      end if;
      return v_existing.id;
    end if;
  end if;

  insert into public.org_training_package_purchases(
    org_id, package_id, athlete_id, purchaser_user_id, status
  ) values (
    v_package.org_id, p_package_id, p_athlete_id, auth.uid(), 'pending'
  )
  returning id into v_purchase_id;

  return v_purchase_id;
end;
$$;

revoke all on function public.request_org_training_package_purchase(uuid, uuid) from public, anon;
grant execute on function public.request_org_training_package_purchase(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
