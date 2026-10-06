-- Unify organization announcement routing/read state and keep the canonical
-- family avatar available anywhere that consumes profiles.avatar_url.

alter table public.org_announcements
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz,
  add column if not exists canceled_at timestamptz;

create index if not exists org_announcements_active_recency_idx
  on public.org_announcements(org_id, created_at desc)
  where canceled_at is null;

drop policy if exists org_announcements_visible on public.org_announcements;
create policy org_announcements_visible on public.org_announcements for select to authenticated using (
  created_by=auth.uid() or (
    canceled_at is null and (expires_at is null or expires_at>now()) and
    exists(select 1 from public.org_announcement_recipients recipient
      where recipient.announcement_id=id and recipient.user_id=auth.uid())
  )
);

drop policy if exists org_announcement_recipients_own on public.org_announcement_recipients;
create policy org_announcement_recipients_own on public.org_announcement_recipients
for select to authenticated using (
  user_id=auth.uid() and exists(
    select 1 from public.org_announcements announcement
    where announcement.id=announcement_id
      and announcement.canceled_at is null
      and (announcement.expires_at is null or announcement.expires_at>now())
  )
);

create or replace function public.send_org_announcement(
  p_org_id uuid, p_title text, p_body text,
  p_audience text default 'organization', p_team_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; recipient record; workspace_id uuid;
begin
  if not public.is_org_director(p_org_id,auth.uid()) then
    raise exception 'Organization director access required' using errcode='42501';
  end if;
  if length(trim(p_title)) not between 1 and 120 then raise exception 'Announcement title is required'; end if;
  if length(trim(p_body)) not between 1 and 4000 then raise exception 'Announcement body is required'; end if;
  if p_audience not in ('organization','teams','coaches','athletes') then raise exception 'Invalid announcement audience'; end if;
  if p_audience='teams' and coalesce(cardinality(p_team_ids),0)=0 then raise exception 'Choose at least one team'; end if;
  if exists(select 1 from unnest(coalesce(p_team_ids,'{}')) selected_id
    where not exists(select 1 from public.org_teams team where team.id=selected_id and team.org_id=p_org_id)) then
    raise exception 'A selected team does not belong to this organization';
  end if;

  select id into workspace_id from public.business_workspaces
  where organization_id=p_org_id and workspace_type='organization' and status='active' limit 1;

  insert into public.org_announcements(org_id,created_by,title,body,audience,team_ids)
  values(p_org_id,auth.uid(),trim(p_title),trim(p_body),p_audience,coalesce(p_team_ids,'{}')) returning id into v_id;

  insert into public.org_announcement_recipients(announcement_id,user_id)
  select v_id,user_id from (
    select membership.user_id
    from public.organization_memberships membership
    where membership.org_id=p_org_id and membership.status='active'
      and (p_audience='organization'
        or p_audience='coaches' and membership.role in ('coach','assistant_coach','program_director')
        or p_audience='athletes' and membership.role='athlete'
        or p_audience='teams' and exists(select 1 from public.org_team_coaches link
          where link.coach_id=membership.user_id and link.team_id=any(p_team_ids)))
    union
    select athlete.owner_user_id
    from public.athlete_organization_memberships organization_link
    join public.athlete_profiles athlete on athlete.id=organization_link.athlete_id
    where organization_link.org_id=p_org_id and organization_link.status='active' and athlete.owner_user_id is not null
      and (p_audience in ('organization','athletes')
        or p_audience='teams' and exists(select 1 from public.org_team_members team_link
          where team_link.athlete_id=athlete.id and team_link.team_id=any(p_team_ids)))
  ) recipients where user_id is not null and user_id<>auth.uid()
  on conflict do nothing;

  for recipient in select user_id from public.org_announcement_recipients where announcement_id=v_id loop
    perform public.notify_user_v2(
      recipient.user_id, trim(p_title), trim(p_body), 'org_announcement', v_id,
      workspace_id,
      jsonb_build_object(
        'workspace_id',workspace_id,'org_id',p_org_id,'record_id',v_id,
        'announcement_id',v_id,'app_destination','/announcements'
      ),
      '/announcements',
      'org-announcement:'||v_id::text||':'||recipient.user_id::text,
      null
    );
  end loop;
  return v_id;
end $$;

revoke all on function public.send_org_announcement(uuid,text,text,text,uuid[]) from public,anon;
grant execute on function public.send_org_announcement(uuid,text,text,text,uuid[]) to authenticated;

create or replace function public.cancel_org_announcement(p_announcement_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare target_org uuid;
begin
  select org_id into target_org from public.org_announcements where id=p_announcement_id;
  if target_org is null then raise exception 'Announcement not found' using errcode='P0002'; end if;
  if not public.is_org_director(target_org,auth.uid()) then raise exception 'Organization director access required' using errcode='42501'; end if;
  update public.org_announcements set canceled_at=coalesce(canceled_at,now()),updated_at=now() where id=p_announcement_id;
  update public.notifications
  set expires_at=now(),read_at=coalesce(read_at,now()),is_read=true
  where related_id=p_announcement_id and type in ('announcement','org_announcement');
end $$;
revoke all on function public.cancel_org_announcement(uuid) from public,anon;
grant execute on function public.cancel_org_announcement(uuid) to authenticated;

create or replace function public.reconcile_org_announcement_lifecycle()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.canceled_at is not null or (new.expires_at is not null and new.expires_at<=now()) then
    update public.notifications
    set expires_at=coalesce(new.expires_at,new.canceled_at,now()),
        read_at=coalesce(read_at,now()),is_read=true
    where related_id=new.id and type in ('announcement','org_announcement');
  elsif new.expires_at is distinct from old.expires_at then
    update public.notifications set expires_at=new.expires_at
    where related_id=new.id and type in ('announcement','org_announcement');
  end if;
  return new;
end $$;

drop trigger if exists reconcile_org_announcement_lifecycle_trigger on public.org_announcements;
create trigger reconcile_org_announcement_lifecycle_trigger
after update of canceled_at,expires_at on public.org_announcements
for each row execute function public.reconcile_org_announcement_lifecycle();

create or replace function public.mark_org_announcement_read(p_announcement_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_read_at timestamptz:=now();
begin
  update public.org_announcement_recipients recipient
  set read_at=coalesce(recipient.read_at,v_read_at)
  where recipient.announcement_id=p_announcement_id and recipient.user_id=auth.uid()
    and exists(select 1 from public.org_announcements announcement
      where announcement.id=recipient.announcement_id
        and announcement.canceled_at is null
        and (announcement.expires_at is null or announcement.expires_at>v_read_at));
  if not found then raise exception 'Announcement unavailable' using errcode='P0002'; end if;
  update public.notifications notification
  set read_at=coalesce(notification.read_at,v_read_at),is_read=true
  where notification.user_id=auth.uid() and notification.related_id=p_announcement_id
    and notification.type in ('announcement','org_announcement');
end $$;
revoke all on function public.mark_org_announcement_read(uuid) from public,anon;
grant execute on function public.mark_org_announcement_read(uuid) to authenticated;

create or replace function public.sync_primary_athlete_avatar_to_account()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.is_primary and nullif(trim(coalesce(new.avatar_url,'')),'') is not null then
    update public.profiles set avatar_url=new.avatar_url,updated_at=now()
    where id=new.owner_user_id and avatar_url is distinct from new.avatar_url;
  end if;
  return new;
end $$;

drop trigger if exists sync_primary_athlete_avatar_to_account_trigger on public.athlete_profiles;
create trigger sync_primary_athlete_avatar_to_account_trigger
after insert or update of avatar_url,is_primary on public.athlete_profiles
for each row execute function public.sync_primary_athlete_avatar_to_account();

update public.profiles account
set avatar_url=athlete.avatar_url,updated_at=now()
from public.athlete_profiles athlete
where athlete.owner_user_id=account.id and athlete.is_primary
  and nullif(trim(coalesce(athlete.avatar_url,'')),'') is not null
  and account.avatar_url is distinct from athlete.avatar_url;

-- Reading a thread must also retire its message push rows. Without this, the
-- SpringBoard badge can show unread messages after the conversation itself has
-- already been acknowledged and the in-app Messages badge is empty.
create or replace function public.reconcile_message_notifications_after_read()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.last_read_at is not null and new.last_read_at is distinct from old.last_read_at then
    update public.notifications notification
    set read_at=coalesce(notification.read_at,new.last_read_at),is_read=true
    where notification.user_id=new.user_id
      and notification.read_at is null
      and public.notification_category(notification.type,notification.data)='messages'
      and notification.data->>'thread_id'=new.thread_id::text
      and notification.created_at<=new.last_read_at;
  end if;
  return new;
end $$;

drop trigger if exists reconcile_message_notifications_after_read_trigger on public.thread_participants;
create trigger reconcile_message_notifications_after_read_trigger
after update of last_read_at on public.thread_participants
for each row execute function public.reconcile_message_notifications_after_read();
