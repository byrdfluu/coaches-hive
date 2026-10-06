-- Authoritative mobile push hardening: privacy, routing, badge accuracy,
-- bounded retries, expiry, observability, and stale-token maintenance.

create table if not exists public.user_push_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  show_message_previews boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_push_preferences enable row level security;
drop policy if exists user_push_preferences_own on public.user_push_preferences;
create policy user_push_preferences_own on public.user_push_preferences
for all to authenticated using(user_id=auth.uid() and public.account_is_active(auth.uid()))
with check(user_id=auth.uid() and public.account_is_active(auth.uid()));
grant select,insert,update on public.user_push_preferences to authenticated;

alter table public.push_notification_deliveries
  add column if not exists max_attempts integer not null default 6,
  add column if not exists dead_lettered_at timestamptz;
alter table public.push_notification_deliveries
  drop constraint if exists push_notification_deliveries_status_check;
alter table public.push_notification_deliveries
  add constraint push_notification_deliveries_status_check
  check(status in ('pending','processing','retrying','delivered','failed','dead_letter')) not valid;
alter table public.push_notification_deliveries
  drop constraint if exists push_notification_deliveries_max_attempts_check;
alter table public.push_notification_deliveries
  add constraint push_notification_deliveries_max_attempts_check
  check(max_attempts between 1 and 12) not valid;

-- The hardened dispatcher returns additional routing, retry, badge, and
-- privacy fields. PostgreSQL cannot change a function's OUT row type through
-- CREATE OR REPLACE, so replace the service-only RPC explicitly.
drop function if exists public.claim_push_notification_deliveries(integer);
create or replace function public.claim_push_notification_deliveries(p_limit integer default 50)
returns table(
  delivery_id uuid, notification_id uuid, device_token_id uuid,
  token text, environment text, title text, body text, notification_type text,
  notification_category text, related_id uuid, workspace_id uuid,
  action_url text, notification_data jsonb, attempt_count integer,
  max_attempts integer, expires_at timestamptz, badge_count integer,
  show_message_previews boolean
)
language plpgsql security definer set search_path=public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;

  -- A preference, membership, block, or token may change after enqueue. Recheck
  -- every authority immediately before the claim leaves the database.
  update public.push_notification_deliveries d
  set status='failed',failure_reason=case
      when n.expires_at is not null and n.expires_at<=now() then 'Notification expired'
      else 'Delivery no longer permitted' end,updated_at=now()
  from public.device_tokens dt,public.notifications n
  where d.device_token_id=dt.id and d.notification_id=n.id
    and d.status in ('pending','retrying')
    and (not dt.active or dt.user_id<>d.user_id or n.user_id<>d.user_id
      or not public.account_is_active(d.user_id)
      or (n.expires_at is not null and n.expires_at<=now())
      or not public.user_allows_notification(d.user_id,n.type,n.category,n.data)
      or (n.type='message_mention' and n.related_id is null)
      or (n.type in ('message','message_mention') and n.related_id is not null and (
        not public.is_thread_participant(n.related_id,d.user_id)
        or exists(select 1 from public.thread_user_settings ts
          where ts.thread_id=n.related_id and ts.user_id=d.user_id
            and (ts.muted or ts.notification_level='none'
              or (ts.notification_level='mentions' and n.type<>'message_mention'))))));

  update public.push_notification_deliveries d
  set status='dead_letter',dead_lettered_at=now(),updated_at=now(),
      failure_reason=coalesce(d.failure_reason,'Maximum delivery attempts reached')
  where d.status in ('pending','retrying') and d.attempt_count>=d.max_attempts;

  return query
  with claimed as (
    select d.id from public.push_notification_deliveries d
    join public.notifications n on n.id=d.notification_id
    where d.status in ('pending','retrying') and d.next_attempt_at<=now()
      and d.attempt_count<d.max_attempts
      and (n.expires_at is null or n.expires_at>now())
    order by d.created_at for update of d skip locked
    limit greatest(1,least(coalesce(p_limit,50),100))
  ), updated as (
    update public.push_notification_deliveries d
    set status='processing',attempt_count=d.attempt_count+1,last_attempt_at=now(),updated_at=now()
    from claimed c where d.id=c.id returning d.*
  )
  select u.id,u.notification_id,u.device_token_id,dt.token,dt.environment,
    n.title,coalesce(n.body,''),coalesce(n.type,'general'),
    coalesce(n.category,public.notification_category(n.type,n.data)),n.related_id,n.workspace_id,
    n.action_url,coalesce(n.data,'{}'::jsonb),u.attempt_count,u.max_attempts,n.expires_at,
    least(99,(select count(*)::integer from public.notifications unread
      where unread.user_id=u.user_id and unread.read_at is null
        and coalesce(unread.is_read,false)=false)),
    coalesce(pref.show_message_previews,false)
  from updated u
  join public.device_tokens dt on dt.id=u.device_token_id
  join public.notifications n on n.id=u.notification_id
  left join public.user_push_preferences pref on pref.user_id=u.user_id;
end $$;
revoke all on function public.claim_push_notification_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_push_notification_deliveries(integer) to service_role;

create or replace function public.maintain_push_device_tokens()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_deactivated integer:=0; v_deleted integer:=0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  update public.device_tokens set active=false,invalidated_at=coalesce(invalidated_at,now()),updated_at=now()
  where active and last_seen_at<now()-interval '180 days';
  get diagnostics v_deactivated=row_count;
  delete from public.device_tokens where not active and updated_at<now()-interval '90 days';
  get diagnostics v_deleted=row_count;
  return jsonb_build_object('deactivated',v_deactivated,'deleted',v_deleted);
end $$;
revoke all on function public.maintain_push_device_tokens() from public,anon,authenticated;
grant execute on function public.maintain_push_device_tokens() to service_role;

create or replace function public.push_delivery_health()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'pending',count(*) filter(where status='pending'),
    'processing',count(*) filter(where status='processing'),
    'retrying',count(*) filter(where status='retrying'),
    'delivered_24h',count(*) filter(where status='delivered' and created_at>=now()-interval '24 hours'),
    'failed_24h',count(*) filter(where status='failed' and created_at>=now()-interval '24 hours'),
    'dead_letter_24h',count(*) filter(where status='dead_letter' and created_at>=now()-interval '24 hours'),
    'oldest_queued_at',min(created_at) filter(where status in ('pending','retrying')),
    'active_tokens', (select count(*) from public.device_tokens where active)
  ) from public.push_notification_deliveries
$$;
revoke all on function public.push_delivery_health() from public,anon,authenticated;
grant execute on function public.push_delivery_health() to service_role;

-- Dispatch newly queued deliveries immediately. The scheduled dispatcher
-- remains the recovery path for retries and missed webhook calls. Resolve the
-- shared secret from Vault at execution time so it is never stored in trigger
-- source, migration history, or application-visible configuration.
create or replace function public.dispatch_new_push_deliveries()
returns trigger language plpgsql security definer
set search_path=public,vault,net as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name='push_dispatch_secret' limit 1;
  if nullif(v_secret,'') is null then return null; end if;
  perform net.http_post(
    url=>'https://fxmxrzhucccneoibksny.supabase.co/functions/v1/send-apns-push',
    headers=>jsonb_build_object('content-type','application/json','x-push-dispatch-secret',v_secret),
    body=>jsonb_build_object('source','notification_delivery_insert'),
    timeout_milliseconds=>5000
  );
  return null;
end $$;
revoke all on function public.dispatch_new_push_deliveries() from public,anon,authenticated;

drop trigger if exists dispatch_new_push_deliveries_trigger on public.push_notification_deliveries;
create trigger dispatch_new_push_deliveries_trigger
after insert on public.push_notification_deliveries
for each statement execute function public.dispatch_new_push_deliveries();

notify pgrst,'reload schema';
