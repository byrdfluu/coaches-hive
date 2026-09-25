-- Lets org directors, independent coaches, and league admins execute refunds
-- for payments made directly to them via the mobile app, instead of routing
-- every refund through superadmin. Adds the owner-scope columns the new
-- POST /api/mobile/refunds/execute route authorizes against, plus league_fee
-- support (payment_type value + owner scope) and the league_has_permission
-- helper that earlier league migrations call but never defined.

alter table public.payment_refund_requests
  drop constraint if exists payment_refund_requests_payment_type_check;
alter table public.payment_refund_requests
  add constraint payment_refund_requests_payment_type_check
  check (payment_type in ('org_fee','coach_fee','marketplace_order','league_fee'));

alter table public.payment_refund_requests
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists coach_id uuid references public.profiles(id) on delete set null,
  add column if not exists league_id uuid references public.leagues(id) on delete set null;

create index if not exists refund_requests_owner_scope_idx
  on public.payment_refund_requests(org_id, coach_id, league_id);

-- Backfill only deterministic ownership, same approach as the workspace_id
-- backfill in 20260808040000_workspace_admin_authority.sql.
update public.payment_refund_requests r
set org_id = (
  select f.org_id from public.org_fee_assignments a
  join public.org_fees f on f.id = a.fee_id
  where a.id = r.payment_record_id
)
where r.org_id is null and r.payment_type = 'org_fee';

update public.payment_refund_requests r
set coach_id = (
  select a.coach_id from public.coach_fee_assignments a where a.id = r.payment_record_id
)
where r.coach_id is null and r.payment_type = 'coach_fee';

update public.payment_refund_requests r
set coach_id = (select o.coach_id from public.marketplace_orders o where o.id = r.payment_record_id),
    org_id = coalesce(r.org_id, (select o.org_id from public.marketplace_orders o where o.id = r.payment_record_id and o.coach_id is null))
where r.coach_id is null and r.org_id is null and r.payment_type = 'marketplace_order';

update public.payment_refund_requests r
set league_id = (select a.league_id from public.league_fee_assignments a where a.id = r.payment_record_id)
where r.league_id is null and r.payment_type = 'league_fee';

create or replace function public.assign_refund_request_owner_scope()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.org_id is not null or new.coach_id is not null or new.league_id is not null then
    return new;
  end if;
  if new.payment_type = 'org_fee' then
    select f.org_id into new.org_id from public.org_fee_assignments a
      join public.org_fees f on f.id = a.fee_id where a.id = new.payment_record_id;
  elsif new.payment_type = 'coach_fee' then
    select a.coach_id into new.coach_id from public.coach_fee_assignments a where a.id = new.payment_record_id;
  elsif new.payment_type = 'marketplace_order' then
    select o.coach_id, o.org_id into new.coach_id, new.org_id from public.marketplace_orders o where o.id = new.payment_record_id;
    if new.coach_id is not null then new.org_id := null; end if;
  elsif new.payment_type = 'league_fee' then
    select a.league_id into new.league_id from public.league_fee_assignments a where a.id = new.payment_record_id;
  end if;
  return new;
end $$;
drop trigger if exists assign_refund_request_owner_scope_trigger on public.payment_refund_requests;
create trigger assign_refund_request_owner_scope_trigger before insert on public.payment_refund_requests
for each row execute function public.assign_refund_request_owner_scope();

-- league_has_permission is called from league_web_payment_and_public_contract.sql
-- (league_join_requests policy + RPCs) but was never defined in any migration.
-- Mirrors the style/signature of is_league_admin (20260909010000_league_foundation_up_to_35_teams.sql).
create or replace function public.league_has_permission(p_league_id uuid, p_permission text, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.league_memberships m
    join public.league_permissions lp on lp.membership_id = m.id
    where m.league_id = p_league_id and m.user_id = p_user_id and m.status = 'active'
      and coalesce((lp.permissions ->> p_permission)::boolean, false)
  )
$$;
revoke all on function public.league_has_permission(uuid,text,uuid) from public, anon;
grant execute on function public.league_has_permission(uuid,text,uuid) to authenticated;
