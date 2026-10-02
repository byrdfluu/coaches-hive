-- Restore the authenticated family entry point for organization training
-- package purchases. One-time/drop-in packages may be purchased repeatedly;
-- recurring packages reuse an actionable subscription request.

create or replace function public.request_org_training_package_purchase(
  p_athlete_id uuid,
  p_package_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_package public.org_training_packages%rowtype;
  v_existing_id uuid;
  v_purchase_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to purchase a package'; end if;

  select * into v_package
  from public.org_training_packages
  where id=p_package_id and status='published';
  if not found then raise exception 'This package is not available'; end if;

  if not exists (
    select 1 from public.my_accessible_athlete_profiles() athlete
    where athlete.id=p_athlete_id
  ) then
    raise exception 'Choose an athlete profile you manage';
  end if;

  if not exists (
    select 1 from public.athlete_organization_memberships membership
    where membership.org_id=v_package.org_id
      and membership.athlete_id=p_athlete_id
      and membership.status='active'
  ) then
    raise exception 'This athlete is not a member of this organization';
  end if;

  if v_package.billing_type='recurring' then
    select id into v_existing_id
    from public.org_training_package_purchases
    where package_id=p_package_id
      and athlete_id=p_athlete_id
      and purchaser_user_id=auth.uid()
      and status in ('pending','active','past_due')
    order by created_at desc
    limit 1;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  insert into public.org_training_package_purchases(
    org_id,package_id,athlete_id,purchaser_user_id,status
  ) values (
    v_package.org_id,p_package_id,p_athlete_id,auth.uid(),'pending'
  ) returning id into v_purchase_id;

  return v_purchase_id;
end;
$$;

revoke all on function public.request_org_training_package_purchase(uuid,uuid) from public,anon;
grant execute on function public.request_org_training_package_purchase(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
