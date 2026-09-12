-- Organization and team broadcasts. A single announcement fans out to
-- recipient/read rows and the existing notification pipeline (including APNS).
create table if not exists public.org_announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null check (length(trim(body)) between 1 and 4000),
  audience text not null default 'organization',
  team_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Upgrade the announcement table already used by the web portal.
alter table public.org_announcements add column if not exists team_ids uuid[] not null default '{}';

create table if not exists public.org_announcement_recipients (
  announcement_id uuid not null references public.org_announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  primary key (announcement_id,user_id)
);

-- Preserve visibility for announcements created before recipient tracking.
insert into public.org_announcement_recipients(announcement_id,user_id)
select a.id,om.user_id from public.org_announcements a
join public.organization_memberships om on om.org_id=a.org_id and om.status='active'
where om.user_id<>coalesce(a.created_by,'00000000-0000-0000-0000-000000000000'::uuid)
on conflict do nothing;
insert into public.org_announcement_recipients(announcement_id,user_id)
select a.id,ap.owner_user_id from public.org_announcements a
join public.athlete_organization_memberships aom on aom.org_id=a.org_id and aom.status='active'
join public.athlete_profiles ap on ap.id=aom.athlete_id
where ap.owner_user_id is not null and ap.owner_user_id<>coalesce(a.created_by,'00000000-0000-0000-0000-000000000000'::uuid)
on conflict do nothing;

create index if not exists org_announcements_org_created_idx on public.org_announcements(org_id,created_at desc);
create index if not exists org_announcement_recipients_user_idx on public.org_announcement_recipients(user_id,read_at);
alter table public.org_announcements enable row level security;
alter table public.org_announcement_recipients enable row level security;

drop policy if exists org_announcements_visible on public.org_announcements;
drop policy if exists org_announcements_select_member on public.org_announcements;
create policy org_announcements_visible on public.org_announcements for select to authenticated using (
  created_by=auth.uid() or exists(select 1 from public.org_announcement_recipients r where r.announcement_id=id and r.user_id=auth.uid())
);
drop policy if exists org_announcement_recipients_own on public.org_announcement_recipients;
create policy org_announcement_recipients_own on public.org_announcement_recipients for select to authenticated using (user_id=auth.uid());
revoke insert,update,delete on public.org_announcements from authenticated,anon;
revoke insert,update,delete on public.org_announcement_recipients from authenticated,anon;
grant select on public.org_announcements,public.org_announcement_recipients to authenticated;

create or replace function public.send_org_announcement(
  p_org_id uuid, p_title text, p_body text, p_audience text default 'organization', p_team_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; r record;
begin
  if not public.is_org_director(p_org_id,auth.uid()) then raise exception 'Organization director access required'; end if;
  if p_audience not in ('organization','teams','coaches','athletes') then raise exception 'Invalid announcement audience'; end if;
  if p_audience='teams' and coalesce(cardinality(p_team_ids),0)=0 then raise exception 'Choose at least one team'; end if;
  if exists(select 1 from unnest(coalesce(p_team_ids,'{}')) x where not exists(select 1 from public.org_teams t where t.id=x and t.org_id=p_org_id)) then
    raise exception 'A selected team does not belong to this organization';
  end if;
  insert into public.org_announcements(org_id,created_by,title,body,audience,team_ids)
  values(p_org_id,auth.uid(),trim(p_title),trim(p_body),p_audience,coalesce(p_team_ids,'{}')) returning id into v_id;

  insert into public.org_announcement_recipients(announcement_id,user_id)
  select v_id,user_id from (
    select om.user_id
    from public.organization_memberships om
    where om.org_id=p_org_id and om.status='active'
      and (p_audience='organization'
        or p_audience='coaches' and om.role in ('coach','assistant_coach')
        or p_audience='athletes' and om.role='athlete'
        or p_audience='teams' and exists(select 1 from public.org_team_coaches tc where tc.coach_id=om.user_id and tc.team_id=any(p_team_ids)))
    union
    select ap.owner_user_id
    from public.athlete_organization_memberships aom join public.athlete_profiles ap on ap.id=aom.athlete_id
    where aom.org_id=p_org_id and aom.status='active' and ap.owner_user_id is not null
      and (p_audience in ('organization','athletes')
        or p_audience='teams' and exists(select 1 from public.org_team_members tm where tm.athlete_id=ap.id and tm.team_id=any(p_team_ids)))
  ) recipients where user_id is not null and user_id<>auth.uid()
  on conflict do nothing;

  for r in select user_id from public.org_announcement_recipients where announcement_id=v_id loop
    perform public.notify_user(r.user_id,p_title,p_body,'announcement',v_id);
  end loop;
  return v_id;
end $$;
revoke all on function public.send_org_announcement(uuid,text,text,text,uuid[]) from public,anon;
grant execute on function public.send_org_announcement(uuid,text,text,text,uuid[]) to authenticated;

create or replace function public.mark_org_announcement_read(p_announcement_id uuid)
returns void language sql security definer set search_path=public as $$
  update public.org_announcement_recipients set read_at=coalesce(read_at,now())
  where announcement_id=p_announcement_id and user_id=auth.uid();
$$;
revoke all on function public.mark_org_announcement_read(uuid) from public,anon;
grant execute on function public.mark_org_announcement_read(uuid) to authenticated;
