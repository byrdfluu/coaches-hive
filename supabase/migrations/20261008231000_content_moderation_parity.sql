-- Forward-only reconciliation of the native content moderation contract.
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  content_type text not null check (content_type in ('message','profile')),
  content_id uuid,
  thread_id uuid references public.threads(id) on delete set null,
  profile_owner_type text check (profile_owner_type in ('coach','athlete','org')),
  profile_owner_id uuid,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','in_review','resolved','dismissed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique(blocker_id, blocked_user_id),
  check (blocker_id <> blocked_user_id)
);

create index if not exists content_reports_status_created_idx on public.content_reports(status,created_at desc);
create index if not exists content_reports_reported_user_idx on public.content_reports(reported_user_id,created_at desc);
create index if not exists user_blocks_blocker_idx on public.user_blocks(blocker_id,blocked_user_id);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_user_id,blocker_id);
alter table public.content_reports enable row level security;
alter table public.user_blocks enable row level security;

drop policy if exists content_reports_insert_own on public.content_reports;
create policy content_reports_insert_own on public.content_reports for insert to authenticated with check(reporter_id=auth.uid());
drop policy if exists content_reports_select_own_or_admin on public.content_reports;
create policy content_reports_select_own_or_admin on public.content_reports for select to authenticated using(reporter_id=auth.uid() or public.is_admin(auth.uid()));
drop policy if exists content_reports_admin_update on public.content_reports;
create policy content_reports_admin_update on public.content_reports for update to authenticated using(public.is_admin(auth.uid())) with check(public.is_admin(auth.uid()));
drop policy if exists content_reports_active_account on public.content_reports;
create policy content_reports_active_account on public.content_reports as restrictive for all to authenticated using(public.account_is_active(auth.uid())) with check(public.account_is_active(auth.uid()));
drop policy if exists content_reports_submission_context on public.content_reports;
create policy content_reports_submission_context on public.content_reports as restrictive for insert to authenticated with check(
  reporter_id=auth.uid() and status='open' and admin_notes is null
  and (content_type<>'message' or (
    thread_id is not null and public.is_thread_participant(thread_id,auth.uid())
    and (content_id is null or exists(select 1 from public.messages m where m.id=content_reports.content_id and m.thread_id=content_reports.thread_id and (content_reports.reported_user_id is null or m.sender_id=content_reports.reported_user_id)))
    and (content_id is not null or reported_user_id is null or exists(select 1 from public.thread_participants tp where tp.thread_id=content_reports.thread_id and tp.user_id=content_reports.reported_user_id))
  ))
);

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own on public.user_blocks for select to authenticated using(blocker_id=auth.uid() or blocked_user_id=auth.uid());
drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own on public.user_blocks for insert to authenticated with check(blocker_id=auth.uid());
drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own on public.user_blocks for delete to authenticated using(blocker_id=auth.uid());

create or replace function public.report_conversation(p_thread_id uuid,p_reason text,p_details text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare message_id uuid; reported_id uuid; report_id uuid;
begin
  if auth.uid() is null or not public.account_is_active(auth.uid()) then raise exception 'Active account required'; end if;
  if not public.is_thread_participant(p_thread_id,auth.uid()) then raise exception 'Conversation access required'; end if;
  if p_reason is null or p_reason not in ('harassment','inappropriate','spam','safety','other') then raise exception 'Choose a valid report reason'; end if;
  if length(coalesce(p_details,''))>10000 then raise exception 'Details must be 10000 characters or fewer'; end if;
  select m.id,m.sender_id into message_id,reported_id from public.messages m where m.thread_id=p_thread_id and m.sender_id<>auth.uid() order by m.created_at desc,m.id desc limit 1;
  if reported_id is null then select user_id into reported_id from public.thread_participants where thread_id=p_thread_id and user_id<>auth.uid() order by created_at,id limit 1; end if;
  insert into public.content_reports(reporter_id,reported_user_id,content_type,content_id,thread_id,reason,details)
  values(auth.uid(),reported_id,'message',message_id,p_thread_id,p_reason,nullif(btrim(p_details),'')) returning id into report_id;
  return report_id;
end $$;
revoke all on function public.report_conversation(uuid,text,text) from public,anon;
grant execute on function public.report_conversation(uuid,text,text) to authenticated;

create or replace function public.admin_review_content_report(p_report_id uuid,p_status text,p_notes text)
returns void language plpgsql security definer set search_path=public as $$
declare report_type text;
begin
  if not public.account_is_active(auth.uid()) or not public.is_admin(auth.uid()) then raise exception 'Administrator access required'; end if;
  if p_status is null or p_status not in ('open','in_review','resolved','dismissed') then raise exception 'Invalid report status'; end if;
  if length(coalesce(p_notes,''))>10000 then raise exception 'Notes must be 10000 characters or fewer'; end if;
  update public.content_reports set status=p_status,admin_notes=coalesce(p_notes,''),updated_at=now() where id=p_report_id returning content_type into report_type;
  if not found then raise exception 'Report not found'; end if;
  insert into public.admin_audit_log(actor_id,target_type,target_id,action,metadata) values(auth.uid(),'content_reports',p_report_id,'content_report_resolved',jsonb_build_object('new_status',p_status,'content_type',report_type));
end $$;
revoke all on function public.admin_review_content_report(uuid,text,text) from public,anon;
grant execute on function public.admin_review_content_report(uuid,text,text) to authenticated;
