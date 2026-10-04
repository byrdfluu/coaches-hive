begin;

alter table public.org_settings
  add column if not exists allow_organization_messaging boolean not null default false;

create table if not exists public.mobile_recipient_threads (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references public.profiles(id) on delete restrict,
  sender_organization_id uuid references public.organizations(id) on delete restrict,
  recipient_type text not null check (recipient_type in ('parent_athlete','coach','program_director','organization','user')),
  recipient_id uuid not null,
  athlete_profile_id uuid references public.athlete_profiles(id) on delete restrict,
  resolved_recipient_user_id uuid not null references public.profiles(id) on delete restrict,
  thread_id uuid not null unique references public.threads(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique nulls not distinct(sender_user_id,sender_organization_id,recipient_type,recipient_id,athlete_profile_id)
);

alter table public.mobile_recipient_threads enable row level security;
drop policy if exists mobile_recipient_threads_participant_read on public.mobile_recipient_threads;
create policy mobile_recipient_threads_participant_read on public.mobile_recipient_threads
for select to authenticated using(
  sender_user_id=auth.uid() or resolved_recipient_user_id=auth.uid()
);

comment on table public.mobile_recipient_threads is
  'Idempotent server-resolved direct-thread bindings. Organization recipient rows retain the organization UUID, not a client-selected staff UUID.';

create or replace function public.open_mobile_recipient_thread(
  p_sender_user_id uuid,
  p_sender_organization_id uuid,
  p_recipient_type text,
  p_recipient_id uuid,
  p_athlete_profile_id uuid,
  p_resolved_recipient_user_id uuid,
  p_thread_organization_id uuid,
  p_title text
) returns table(thread_id uuid,reused boolean)
language plpgsql security definer set search_path=public as $$
declare v_thread uuid;
begin
  if p_recipient_type not in ('parent_athlete','coach','program_director','organization','user')
    then raise exception 'recipient_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_sender_user_id::text||':'||coalesce(p_sender_organization_id::text,'')||':'||
    p_recipient_type||':'||p_recipient_id::text||':'||coalesce(p_athlete_profile_id::text,''),0));
  select m.thread_id into v_thread from mobile_recipient_threads m
  where m.sender_user_id=p_sender_user_id
    and m.sender_organization_id is not distinct from p_sender_organization_id
    and m.recipient_type=p_recipient_type and m.recipient_id=p_recipient_id
    and m.athlete_profile_id is not distinct from p_athlete_profile_id;
  if v_thread is not null then return query select v_thread,true;return;end if;
  insert into threads(title,is_group,created_by,org_id)
    values(coalesce(nullif(trim(p_title),''),'Conversation'),false,p_sender_user_id,p_thread_organization_id)
    returning id into v_thread;
  insert into thread_participants(thread_id,user_id,role) values
    (v_thread,p_sender_user_id,case when p_sender_organization_id is null then 'family' else 'organization' end),
    (v_thread,p_resolved_recipient_user_id,p_recipient_type);
  insert into mobile_recipient_threads(sender_user_id,sender_organization_id,recipient_type,recipient_id,
    athlete_profile_id,resolved_recipient_user_id,thread_id) values
    (p_sender_user_id,p_sender_organization_id,p_recipient_type,p_recipient_id,p_athlete_profile_id,
      p_resolved_recipient_user_id,v_thread);
  return query select v_thread,false;
end $$;
revoke all on function public.open_mobile_recipient_thread(uuid,uuid,text,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.open_mobile_recipient_thread(uuid,uuid,text,uuid,uuid,uuid,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
