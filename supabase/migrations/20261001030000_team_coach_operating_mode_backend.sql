-- Mirror the mobile operating-mode schema and expose the value from the
-- canonical workspace selector. This changes classification only; no tenant,
-- billing, roster, product, Stripe, or historical rows are recreated.
alter table public.independent_coach_profiles
  add column if not exists operating_mode text not null default 'single_team';

-- Preserve established trainer businesses. New rows keep the single_team
-- default; only profiles with authoritative private-training signals are
-- classified as independent trainers.
update public.independent_coach_profiles icp
set operating_mode='independent_coach'
where operating_mode='single_team' and (
  booking_enabled or booking_url is not null
  or session_price_cents is not null or group_session_price_cents is not null
  or camp_price_cents is not null or coalesce(cardinality(services),0)>0
  or exists(select 1 from public.availability_blocks a where a.coach_id=icp.coach_id)
  or exists(select 1 from public.coach_membership_plans mp where mp.coach_id=icp.coach_id and mp.status='active')
  or exists(select 1 from public.marketplace_items mi where mi.coach_id=icp.coach_id and mi.is_active=true)
  or exists(select 1 from public.products pr where pr.coach_id=icp.coach_id and lower(coalesce(pr.status,'active')) in ('active','published'))
);

alter table public.independent_coach_profiles
  drop constraint if exists independent_coach_profiles_operating_mode_check;
alter table public.independent_coach_profiles
  add constraint independent_coach_profiles_operating_mode_check
  check (operating_mode in ('single_team','independent_coach','both'));

drop function if exists public.available_workspaces();
create function public.available_workspaces()
returns table(
  workspace_id uuid, workspace_type text, display_name text,
  organization_id uuid, league_id uuid, roles text[], permissions jsonb,
  is_last_used boolean, operating_mode text
)
language sql stable security definer set search_path=public as $$
  select w.id,w.workspace_type,w.display_name,w.organization_id,w.league_id,
    m.roles,m.permissions,coalesce(p.workspace_id=w.id,false),
    case when w.workspace_type='independent_coach'
      then coalesce(icp.operating_mode,'single_team') else null end
  from workspace_memberships m
  join business_workspaces w on w.id=m.workspace_id
  left join active_workspace_preferences p on p.user_id=auth.uid()
  left join independent_coach_profiles icp
    on w.workspace_type='independent_coach' and icp.coach_id=w.owner_user_id
  where m.user_id=auth.uid() and m.status='active' and w.status<>'archived'
  order by coalesce(p.workspace_id=w.id,false) desc,w.display_name
$$;
revoke all on function public.available_workspaces() from public,anon;
grant execute on function public.available_workspaces() to authenticated;
