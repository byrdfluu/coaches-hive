begin;

do $$
declare
  v_org uuid;
  v_director uuid;
  v_team uuid;
  v_program_director uuid:=gen_random_uuid();
  v_organization uuid;
  v_teams uuid;
  v_coaches uuid;
  v_athletes uuid;
  v_recipient uuid;
  v_thread uuid;
  v_thread_user uuid;
  v_athlete uuid;
  v_athlete_owner uuid;
  v_avatar text:='https://example.invalid/contract-avatar.png';
  v_count integer;
begin
  select membership.org_id,membership.user_id,team.id
  into v_org,v_director,v_team
  from public.organization_memberships membership
  join public.org_teams team on team.org_id=membership.org_id
  where membership.status='active'
    and membership.role in ('org_admin','program_director','athletic_director')
    and exists(select 1 from public.athlete_organization_memberships link
      where link.org_id=membership.org_id and link.status='active')
  limit 1;
  if v_org is null then raise exception 'No eligible organization announcement fixture'; end if;

  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values(v_program_director,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    v_program_director||'@example.invalid','',now(),now(),now());
  insert into public.profiles(id,role,full_name,status)
  values(v_program_director,'coach','Announcement Contract Director','active')
  on conflict(id) do update set full_name=excluded.full_name,status='active';
  insert into public.organization_memberships(org_id,user_id,role,status)
  values(v_org,v_program_director,'program_director','active');
  insert into public.org_team_coaches(team_id,coach_id,role)
  values(v_team,v_program_director,'program_director');

  perform set_config('request.jwt.claim.sub',v_director::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  v_organization:=public.send_org_announcement(v_org,'Contract organization','Contract body','organization','{}');
  v_teams:=public.send_org_announcement(v_org,'Contract team','Contract body','teams',array[v_team]);
  v_coaches:=public.send_org_announcement(v_org,'Contract coaches','Contract body','coaches','{}');
  v_athletes:=public.send_org_announcement(v_org,'Contract athletes','Contract body','athletes','{}');

  if not exists(select 1 from public.org_announcement_recipients where announcement_id=v_coaches and user_id=v_program_director)
    then raise exception 'Program director missing from coach audience'; end if;
  if not exists(select 1 from public.org_announcement_recipients where announcement_id=v_teams and user_id=v_program_director)
    then raise exception 'Program director missing from team audience'; end if;
  if not exists(select 1 from public.org_announcement_recipients where announcement_id=v_athletes)
    then raise exception 'Athlete audience resolved no recipients'; end if;

  select count(*) into v_count from (
    select notification.related_id,notification.user_id,count(*) total
    from public.notifications notification
    where notification.related_id in (v_organization,v_teams,v_coaches,v_athletes)
      and notification.type='org_announcement'
    group by notification.related_id,notification.user_id having count(*)<>1
  ) duplicates;
  if v_count<>0 then raise exception 'Duplicate announcement notification detected'; end if;
  if exists(
    select 1 from (values(v_organization),(v_teams),(v_coaches),(v_athletes)) ids(id)
    where (select count(*) from public.notifications n where n.related_id=ids.id and n.type='org_announcement')
       <> (select count(*) from public.org_announcement_recipients r where r.announcement_id=ids.id)
  ) then raise exception 'Recipient and notification counts disagree'; end if;

  select user_id into v_recipient from public.org_announcement_recipients
  where announcement_id=v_athletes limit 1;
  perform set_config('request.jwt.claim.sub',v_recipient::text,true);
  perform public.mark_org_announcement_read(v_athletes);
  if not exists(select 1 from public.org_announcement_recipients
      where announcement_id=v_athletes and user_id=v_recipient and read_at is not null)
    or not exists(select 1 from public.notifications
      where related_id=v_athletes and user_id=v_recipient and read_at is not null and is_read)
    then raise exception 'Announcement read state did not reconcile'; end if;

  perform set_config('request.jwt.claim.sub',v_director::text,true);
  perform public.cancel_org_announcement(v_organization);
  if exists(select 1 from public.notifications where related_id=v_organization and (read_at is null or not is_read))
    then raise exception 'Canceled announcement notification remained unread'; end if;

  select participant.thread_id,participant.user_id into v_thread,v_thread_user
  from public.thread_participants participant limit 1;
  if v_thread is not null then
    insert into public.notifications(user_id,title,body,type,related_id,data)
    values(v_thread_user,'Contract message','Contract body','message',v_thread,jsonb_build_object('thread_id',v_thread));
    update public.thread_participants set last_read_at=now()
    where thread_id=v_thread and user_id=v_thread_user;
    if exists(select 1 from public.notifications where user_id=v_thread_user
        and data->>'thread_id'=v_thread::text and read_at is null)
      then raise exception 'Message notification remained unread after thread read'; end if;
  end if;

  select athlete.id,athlete.owner_user_id into v_athlete,v_athlete_owner
  from public.athlete_profiles athlete
  where athlete.is_primary and athlete.owner_user_id is not null limit 1;
  if v_athlete is not null then
    update public.athlete_profiles set avatar_url=v_avatar where id=v_athlete;
    if not exists(select 1 from public.profiles where id=v_athlete_owner and avatar_url=v_avatar)
      then raise exception 'Primary athlete avatar did not sync to account'; end if;
  end if;
end $$;

do $$
begin
  if not exists(select 1 from pg_policies where schemaname='public'
      and tablename='org_announcements' and policyname='org_announcements_visible'
      and qual ilike '%canceled_at is null%' and qual ilike '%expires_at%')
    then raise exception 'Announcement active-state RLS missing'; end if;
  if not exists(select 1 from pg_policies where schemaname='public'
      and tablename='org_announcement_recipients' and policyname='org_announcement_recipients_own'
      and qual ilike '%canceled_at is null%' and qual ilike '%expires_at%')
    then raise exception 'Recipient active-state RLS missing'; end if;
end $$;

rollback;
