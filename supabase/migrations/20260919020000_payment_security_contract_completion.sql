-- Follow-up to 20260919010000. The earlier version is already deployed, so
-- contract additions live in a new migration rather than rewriting history.

create table if not exists public.payment_security_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  action text not null,
  table_name text not null,
  record_id uuid,
  changed_fields text[] not null default '{}',
  request_id text,
  created_at timestamptz not null default now()
);
alter table public.payment_security_audit
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete set null,
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists stripe_object_id text,
  add column if not exists result text not null default 'attempted',
  add column if not exists correlation_id uuid not null default gen_random_uuid(),
  add column if not exists metadata jsonb not null default '{}'::jsonb;
create index if not exists payment_security_audit_actor_idx on public.payment_security_audit(actor_user_id,created_at desc);
create index if not exists payment_security_audit_workspace_idx on public.payment_security_audit(workspace_id,created_at desc);
create index if not exists payment_security_audit_target_idx on public.payment_security_audit(target_type,target_id,created_at desc);

create table if not exists public.payment_action_rate_limits (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  resource_key text not null default 'global',
  created_at timestamptz not null default now()
);
create index if not exists payment_action_rate_limits_window_idx
  on public.payment_action_rate_limits(actor_user_id,action,resource_key,created_at desc);

create or replace function public.assert_payment_action_rate_limit(
  p_actor_user_id uuid,
  p_action text,
  p_resource_key text,
  p_max_attempts integer default 8,
  p_window_seconds integer default 60
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_count bigint;
begin
  if p_actor_user_id is null or length(trim(p_action))=0 or p_max_attempts < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit request';
  end if;
  if auth.role() <> 'service_role' and p_actor_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text || ':' || p_action || ':' || coalesce(p_resource_key,'global'),0));
  select count(*) into v_count from public.payment_action_rate_limits
    where actor_user_id=p_actor_user_id and action=p_action and resource_key=coalesce(p_resource_key,'global')
      and created_at >= now() - make_interval(secs=>p_window_seconds);
  if v_count >= p_max_attempts then raise exception 'rate_limit_exceeded' using errcode='P0001'; end if;
  insert into public.payment_action_rate_limits(actor_user_id,action,resource_key)
  values(p_actor_user_id,p_action,coalesce(p_resource_key,'global'));
end $$;

alter table public.payment_security_audit enable row level security;
alter table public.payment_action_rate_limits enable row level security;
revoke all on public.payment_security_audit,public.payment_action_rate_limits from anon,authenticated;
revoke all on function public.assert_payment_action_rate_limit(uuid,text,text,integer,integer) from public,anon;
grant execute on function public.assert_payment_action_rate_limit(uuid,text,text,integer,integer) to authenticated,service_role;
grant select on public.payment_security_audit to authenticated;

drop policy if exists payment_security_audit_superadmin_read on public.payment_security_audit;
create policy payment_security_audit_superadmin_read on public.payment_security_audit for select to authenticated
using(public.is_superadmin(auth.uid()));

-- Authoritative financial rows are readable only through their existing scoped
-- policies and are never directly writable by browser/mobile authenticated roles.
do $$
declare t text;
begin
  foreach t in array array[
    'payment_transactions','stripe_connect_payment_accounting','payment_receipts',
    'organization_recurring_fees','organization_recurring_fee_invoices',
    'refund_requests','platform_subscriptions'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
    end if;
  end loop;
end $$;

-- Event IDs must remain globally unique for idempotent processing.
create unique index if not exists stripe_webhook_events_event_id_uidx
  on public.stripe_webhook_events(event_id);

alter table public.payment_transactions add column if not exists idempotency_key text;
create unique index if not exists payment_transactions_operation_idempotency_uidx
  on public.payment_transactions(payer_id,source_record_type,source_record_id,idempotency_key)
  where idempotency_key is not null;

do $$ begin
  alter publication supabase_realtime add table public.payment_security_audit;
exception when duplicate_object then null; end $$;
