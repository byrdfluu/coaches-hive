-- Canonical tenant-aware notification contract shared by web and mobile.
-- This migration is additive so existing producers and older clients continue
-- to work while they move to notify_user_v2 / insertNotifications.

alter table public.notifications
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete cascade,
  add column if not exists category text,
  add column if not exists deduplication_key text,
  add column if not exists expires_at timestamptz;

alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notifications add constraint notifications_category_check check (
  category is null or category in (
    'messages','schedule','payments','registrations','roster','documents',
    'marketplace','results','attendance','invites','account','security','general'
  )
) not valid;

drop index if exists public.notifications_user_dedupe_uidx;
create unique index notifications_user_dedupe_uidx
  on public.notifications(user_id,deduplication_key);
create index if not exists notifications_workspace_created_idx on public.notifications(workspace_id,created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id,created_at desc) where read_at is null;

create or replace function public.notification_category(p_type text,p_data jsonb default '{}'::jsonb)
returns text language sql immutable as $$
  select case lower(coalesce(nullif(p_data->>'category',''),''))
    when 'message' then 'messages' when 'messages' then 'messages'
    when 'session' then 'schedule' when 'sessions' then 'schedule' when 'schedule' then 'schedule'
    when 'payment' then 'payments' when 'payments' then 'payments'
    when 'registration' then 'registrations' when 'registrations' then 'registrations'
    when 'roster' then 'roster' when 'team' then 'roster' when 'teams' then 'roster'
    when 'document' then 'documents' when 'documents' then 'documents'
    when 'waiver' then 'documents' when 'waivers' then 'documents'
    when 'marketplace' then 'marketplace' when 'orders' then 'marketplace'
    when 'result' then 'results' when 'results' then 'results'
    when 'attendance' then 'attendance' when 'invite' then 'invites' when 'invites' then 'invites'
    when 'account' then 'account' when 'security' then 'security' when 'general' then 'general'
    else case
      when coalesce(p_type,'') ~* 'security|password|login|account|verification' then 'security'
      when coalesce(p_type,'') ~* 'message|mention|announcement' then 'messages'
      when coalesce(p_type,'') ~* 'schedule|session|booking|game|event' then 'schedule'
      when coalesce(p_type,'') ~* 'payment|fee|dues|refund|payout|subscription|dispute' then 'payments'
      when coalesce(p_type,'') ~* 'registration|join_request|waitlist' then 'registrations'
      when coalesce(p_type,'') ~* 'invite' then 'invites'
      when coalesce(p_type,'') ~* 'roster|team|coach|athlete|leave_request' then 'roster'
      when coalesce(p_type,'') ~* 'waiver|document|compliance|consent' then 'documents'
      when coalesce(p_type,'') ~* 'marketplace|order|product' then 'marketplace'
      when coalesce(p_type,'') ~* 'score|result|standing' then 'results'
      when coalesce(p_type,'') ~* 'attendance|check_in' then 'attendance'
      else 'general' end end
$$;

create or replace function public.normalize_notification_contract()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.data:=coalesce(new.data,'{}'::jsonb);
  new.category:=coalesce(new.category,public.notification_category(new.type,new.data));
  if new.workspace_id is null and nullif(new.data->>'workspace_id','') is not null then
    begin new.workspace_id:=(new.data->>'workspace_id')::uuid;
    exception when invalid_text_representation then new.workspace_id:=null; end;
  end if;
  if new.action_url is null and nullif(new.data->>'app_destination','') is not null then
    new.action_url:='/open-app?from='||replace(new.data->>'app_destination','/','%2F');
  end if;
  return new;
end $$;
drop trigger if exists normalize_notification_contract_trigger on public.notifications;
create trigger normalize_notification_contract_trigger before insert or update of type,data,category,workspace_id
on public.notifications for each row execute function public.normalize_notification_contract();

update public.notifications set category=public.notification_category(type,data),
  workspace_id=case when workspace_id is not null then workspace_id
    when nullif(data->>'workspace_id','') ~ '^[0-9a-fA-F-]{36}$' then (data->>'workspace_id')::uuid else null end
where category is null or workspace_id is null;

create or replace function public.notification_is_critical(p_category text,p_type text,p_data jsonb)
returns boolean language sql immutable as $$
  select coalesce((coalesce(p_data,'{}'::jsonb)->>'critical')::boolean,false)
    or p_category in ('security','account')
    or coalesce(p_type,'') ~* 'password|login|security|account_deletion|payment_failed|chargeback|webhook_failure'
$$;

-- Bring preference tables to one compatible contract before referencing them.
alter table if exists public.org_notification_preferences
  add column if not exists new_message boolean not null default true,
  add column if not exists new_payment_received boolean not null default true,
  add column if not exists team_updates boolean not null default true,
  add column if not exists new_invite_accepted boolean not null default true,
  add column if not exists attendance_alerts boolean not null default true;

create table if not exists public.league_notification_preferences (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  messages boolean not null default true,
  payments boolean not null default true,
  documents boolean not null default true,
  schedule_changes boolean not null default true,
  game_results boolean not null default true,
  registrations boolean not null default true,
  join_requests boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.league_notification_preferences enable row level security;
drop policy if exists league_notification_preferences_member on public.league_notification_preferences;
create policy league_notification_preferences_member on public.league_notification_preferences for all to authenticated
using(exists(select 1 from public.league_memberships lm where lm.league_id=league_notification_preferences.league_id and lm.user_id=auth.uid() and lm.status='active'))
with check(exists(select 1 from public.league_memberships lm where lm.league_id=league_notification_preferences.league_id and lm.user_id=auth.uid() and lm.status='active'));
grant select,insert,update on public.league_notification_preferences to authenticated;

create or replace function public.user_allows_notification(p_user_id uuid,p_type text,p_category text,p_data jsonb)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare v_org uuid;v_league uuid;v_allowed boolean:=true;
begin
  p_data:=coalesce(p_data,'{}'::jsonb);p_category:=coalesce(p_category,public.notification_category(p_type,p_data));
  if public.notification_is_critical(p_category,p_type,p_data) then return true; end if;
  select not exists(select 1 from public.athlete_notification_preferences p where p.athlete_id=p_user_id and (
    (p_category='messages' and not p.messages) or (p_category='schedule' and not p.schedule_changes)
    or (p_category='payments' and not p.payment_reminders) or (p_category='marketplace' and not p.marketplace_updates)
    or (p_category='documents' and not p.waiver_reminders)))
  and not exists(select 1 from public.coach_notification_preferences p where p.coach_id=p_user_id and (
    (p_category='messages' and not p.new_messages) or (p_category='schedule' and not p.schedule_changes)
    or (p_category='marketplace' and not p.marketplace_orders) or (p_category='documents' and not p.waiver_updates)
    or (p_category='attendance' and not p.attendance_reminders))) into v_allowed;
  if not v_allowed then return false;end if;
  begin v_org:=nullif(p_data->>'org_id','')::uuid;exception when invalid_text_representation then v_org:=null;end;
  if v_org is not null then select case p_category when 'messages' then new_message when 'payments' then new_payment_received
    when 'marketplace' then marketplace_orders when 'schedule' then schedule_changes when 'roster' then roster_updates
    when 'invites' then new_invite_accepted when 'attendance' then attendance_alerts else true end into v_allowed
    from public.org_notification_preferences where org_id=v_org;
    if coalesce(v_allowed,true)=false then return false;end if;
  end if;
  begin v_league:=nullif(p_data->>'league_id','')::uuid;exception when invalid_text_representation then v_league:=null;end;
  if v_league is not null then select case p_category when 'messages' then messages when 'payments' then payments
    when 'documents' then documents when 'schedule' then schedule_changes when 'results' then game_results
    when 'registrations' then registrations when 'roster' then join_requests else true end into v_allowed
    from public.league_notification_preferences where league_id=v_league;end if;
  return coalesce(v_allowed,true);
end $$;
revoke all on function public.user_allows_notification(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.user_allows_notification(uuid,text,text,jsonb) to service_role;

create or replace function public.notify_user_v2(
  p_user_id uuid,p_title text,p_body text,p_type text,p_related_id uuid default null,
  p_workspace_id uuid default null,p_data jsonb default '{}'::jsonb,p_destination text default null,
  p_deduplication_key text default null,p_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_user_id is null or not public.account_is_active(p_user_id) then return null;end if;
  insert into public.notifications(user_id,title,body,type,related_id,workspace_id,data,action_url,deduplication_key,expires_at)
  values(p_user_id,p_title,left(coalesce(p_body,''),1800),p_type,p_related_id,p_workspace_id,coalesce(p_data,'{}'::jsonb),
    case when p_destination is null then null else '/open-app?from='||replace(p_destination,'/','%2F') end,p_deduplication_key,p_expires_at)
  on conflict(user_id,deduplication_key) do nothing returning id into v_id;
  return v_id;
end $$;
revoke all on function public.notify_user_v2(uuid,text,text,text,uuid,uuid,jsonb,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.notify_user_v2(uuid,text,text,text,uuid,uuid,jsonb,text,text,timestamptz) to service_role;

create table if not exists public.admin_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  operational_alerts boolean not null default true,commerce_alerts boolean not null default true,
  support_and_safety boolean not null default true,daily_digest boolean not null default true,
  weekly_digest boolean not null default true,updated_at timestamptz not null default now()
);
alter table public.admin_notification_preferences enable row level security;
drop policy if exists admin_notification_preferences_own on public.admin_notification_preferences;
create policy admin_notification_preferences_own on public.admin_notification_preferences for all to authenticated
using(user_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','superadmin')))
with check(user_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','superadmin')));
grant select,insert,update on public.admin_notification_preferences to authenticated;

notify pgrst,'reload schema';
