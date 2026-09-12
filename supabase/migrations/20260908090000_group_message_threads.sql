-- Create group conversations atomically. The caller is always included and
-- clients may not add blocked, missing, or arbitrary duplicate identities.
create or replace function public.create_group_thread(
  p_title text,
  p_participant_ids uuid[],
  p_org_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_thread uuid;
  v_title text := nullif(trim(p_title), '');
  v_recipients uuid[];
begin
  if v_sender is null then raise exception 'Authentication required'; end if;
  if v_title is null or char_length(v_title) > 80 then
    raise exception 'Enter a group name between 1 and 80 characters';
  end if;

  select coalesce(array_agg(distinct id), '{}') into v_recipients
  from unnest(coalesce(p_participant_ids, '{}')) id
  where id is not null and id <> v_sender;

  if cardinality(v_recipients) < 2 then
    raise exception 'Select at least two other people for a group message';
  end if;
  if cardinality(v_recipients) > 49 then
    raise exception 'Group messages support up to 50 total participants';
  end if;
  if (select count(*) from public.profiles where id = any(v_recipients)) <> cardinality(v_recipients) then
    raise exception 'One or more recipients are unavailable';
  end if;
  if exists (
    select 1 from public.user_blocks
    where (blocker_id = v_sender and blocked_user_id = any(v_recipients))
       or (blocked_user_id = v_sender and blocker_id = any(v_recipients))
  ) then
    raise exception 'One or more selected people cannot be added to this conversation';
  end if;
  if (select count(*) from public.threads where created_by=v_sender and created_at>now()-interval '1 hour') >= 10 then
    raise exception 'New conversation rate limit reached. Please wait before creating another group.';
  end if;
  if p_org_id is not null and not public.is_org_member(p_org_id, v_sender) then
    raise exception 'You do not have access to this organization';
  end if;

  insert into public.threads(org_id, title, created_by)
  values (p_org_id, v_title, v_sender)
  returning id into v_thread;

  insert into public.thread_participants(thread_id, user_id)
  select v_thread, id from unnest(array_append(v_recipients, v_sender)) id;

  return v_thread;
end;
$$;

revoke all on function public.create_group_thread(text, uuid[], uuid) from public;
grant execute on function public.create_group_thread(text, uuid[], uuid) to authenticated;

-- Program audiences are visible only to organization staff or the coach
-- assigned to the program. Athlete/guardian accounts never receive the
-- program's participant directory.
create or replace function public.message_program_audiences()
returns table(program_id uuid, program_name text, user_id uuid, full_name text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct p.id, p.name, r.owner_user_id,
    coalesce(nullif(trim(ap.full_name), ''), nullif(trim(pr.full_name), ''), 'Athlete')
  from public.programs p
  join public.program_registrations r on r.program_id = p.id
  join public.athlete_profiles ap on ap.id = r.athlete_profile_id
  join public.profiles pr on pr.id = r.owner_user_id
  where auth.uid() is not null
    and (p.coach_id = auth.uid() or public.is_org_member(p.org_id, auth.uid()))
    and p.status in ('active', 'closed')
    and r.status not in ('cancelled', 'canceled', 'expired')
    and r.owner_user_id <> auth.uid();
$$;

revoke all on function public.message_program_audiences() from public;
grant execute on function public.message_program_audiences() to authenticated;
