begin;

drop function if exists public.discover_public_org_coaches(uuid);
create function public.discover_public_org_coaches(p_org_id uuid default null)
returns table(
  coach_id uuid,
  full_name text,
  org_id uuid,
  org_name text,
  role_label text,
  can_message boolean,
  message_unavailable_reason text
)
language sql stable security definer set search_path='' as $$
  select distinct on (p.id,w.organization_id)
    p.id,
    coalesce(nullif(trim(p.full_name),''),'Organization staff'),
    w.organization_id,
    coalesce(nullif(trim(os.org_name),''),nullif(trim(o.name),''),'Organization'),
    case when 'program_director'=any(m.roles) then 'Program Director' else 'Coach' end,
    not exists(
      select 1 from public.user_blocks b
      where (b.blocker_id=auth.uid() and b.blocked_user_id=p.id)
         or (b.blocker_id=p.id and b.blocked_user_id=auth.uid())
    ),
    case when exists(
      select 1 from public.user_blocks b
      where (b.blocker_id=auth.uid() and b.blocked_user_id=p.id)
         or (b.blocker_id=p.id and b.blocked_user_id=auth.uid())
    ) then 'blocked' else null::text end
  from public.business_workspaces w
  join public.organizations o on o.id=w.organization_id
  join public.workspace_memberships m on m.workspace_id=w.id and m.status='active'
  join public.profiles p on p.id=m.user_id
  left join public.org_settings os on os.org_id=o.id
  where auth.uid() is not null
    and (p_org_id is null or w.organization_id=p_org_id)
    and w.workspace_type='organization' and w.status='active' and coalesce(w.is_test,false)=false
    and coalesce(o.status,'active')='active' and coalesce(o.is_test,false)=false
    and coalesce(p.status,'active')='active' and coalesce(p.is_test,false)=false
    and m.roles && array['coach','assistant_coach','program_director']::text[]
    and coalesce((p.coach_privacy_settings->>'visibleToAthletes')::boolean,true)=true
    and coalesce((p.coach_privacy_settings->>'allowDirectMessages')::boolean,true)=true
  order by p.id,w.organization_id,
    case when 'program_director'=any(m.roles) then 0 else 1 end;
$$;
revoke all on function public.discover_public_org_coaches(uuid) from public,anon;
grant execute on function public.discover_public_org_coaches(uuid) to authenticated;

do $$
declare v_org uuid;v_workspace uuid;v_evan uuid;
begin
  select os.org_id into v_org from public.org_settings os
  where lower(trim(coalesce(os.org_name,''))) in ('rudy gay academy','the rudy gay academy') limit 1;
  if v_org is null then raise notice 'Rudy Gay Academy was not found';return;end if;
  select w.id into v_workspace from public.business_workspaces w
  where w.organization_id=v_org and w.workspace_type='organization' and w.status='active'
    and coalesce(w.is_test,false)=false limit 1;
  select p.id into v_evan from public.workspace_memberships m join public.profiles p on p.id=m.user_id
  where m.workspace_id=v_workspace and m.status='active' and 'program_director'=any(m.roles)
    and (lower(coalesce(p.full_name,'')) like 'evan%' or lower(coalesce(p.email,''))='evansingleton11@gmail.com')
  order by m.created_at limit 1;
  if v_evan is null then raise notice 'Eligible Evan Singleton program director was not found';return;end if;
  update public.profiles set full_name='Evan Singleton',updated_at=now() where id=v_evan
    and (nullif(trim(full_name),'') is null or lower(trim(full_name))=lower(trim(coalesce(email,''))));
  update public.org_settings set primary_family_contact_user_id=v_evan,
    primary_family_contact_label='Parent Support',updated_at=now() where org_id=v_org;
end $$;

notify pgrst,'reload schema';
commit;
