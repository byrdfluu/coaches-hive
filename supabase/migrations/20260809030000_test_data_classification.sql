-- Explicit test/demo classification for production Supabase data. Safe to rerun.

alter table public.profiles add column if not exists is_test boolean not null default false;
alter table public.athlete_profiles add column if not exists is_test boolean not null default false;
alter table public.organizations add column if not exists is_test boolean not null default false;
alter table public.business_workspaces add column if not exists is_test boolean not null default false;

create index if not exists profiles_is_test_idx on public.profiles(is_test);
create index if not exists athlete_profiles_is_test_idx on public.athlete_profiles(is_test);
create index if not exists organizations_is_test_idx on public.organizations(is_test);
create index if not exists business_workspaces_is_test_idx on public.business_workspaces(is_test);

create or replace function public.admin_set_user_test_status(
  p_user_id uuid,
  p_is_test boolean,
  p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Reason is required'; end if;

  update public.profiles set is_test = p_is_test, updated_at = now() where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
  update public.athlete_profiles set is_test = p_is_test where owner_user_id = p_user_id;
  update public.business_workspaces set is_test = p_is_test, updated_at = now()
    where workspace_type = 'independent_coach' and owner_user_id = p_user_id;

  insert into public.admin_audit_log(actor_id,target_type,target_id,action,metadata)
  values(auth.uid(),'profile',p_user_id,
    case when p_is_test then 'admin.user.marked_test' else 'admin.user.marked_production' end,
    jsonb_build_object('reason',trim(p_reason),'is_test',p_is_test));
end $$;

create or replace function public.admin_set_organization_test_status(
  p_org_id uuid,
  p_is_test boolean,
  p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Reason is required'; end if;

  update public.organizations set is_test = p_is_test, updated_at = now() where id = p_org_id;
  if not found then raise exception 'Organization not found'; end if;
  update public.business_workspaces set is_test = p_is_test, updated_at = now()
    where workspace_type = 'organization' and organization_id = p_org_id;

  insert into public.admin_audit_log(actor_id,target_type,target_id,action,metadata)
  values(auth.uid(),'organization',p_org_id,
    case when p_is_test then 'admin.organization.marked_test' else 'admin.organization.marked_production' end,
    jsonb_build_object('reason',trim(p_reason),'is_test',p_is_test));
end $$;

create or replace function public.admin_revenue_summary()
returns table(total_revenue numeric,month_revenue numeric,transaction_count bigint)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  return query select
    coalesce(sum(a.gross_amount_cents),0)::numeric/100,
    coalesce(sum(a.gross_amount_cents) filter(where a.created_at>=date_trunc('month',now())),0)::numeric/100,
    count(*)
  from public.stripe_connect_payment_accounting a
  left join public.business_workspaces w on w.id=a.workspace_id
  where a.livemode=true and coalesce(w.is_test,false)=false;
end $$;

-- Reapply the recipient-aware ledger with test workspaces excluded.
create or replace function public.admin_revenue_ledger()
returns table(id uuid,description text,amount numeric,created_at timestamptz,owner_name text,owner_type text,checkout_type text,payment_record_id uuid,stripe_checkout_session_id text,stripe_payment_intent_id text)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  return query
  select a.id,
    case when a.checkout_type='coach_fee' then coalesce(cfa.name,'Independent coach transaction')
      when a.checkout_type in ('mobile_marketplace','marketplace') then coalesce(mi.name,'Marketplace transaction')
      when a.checkout_type='org_fee' then 'Organization fee'
      when a.checkout_type='mobile_program' then 'Program registration'
      else initcap(replace(a.checkout_type,'_',' ')) end::text,
    a.gross_amount_cents::numeric/100,a.created_at,
    coalesce(w.display_name,cp.full_name,mcp.full_name,o.name,mo_org.name,
      case when cfa.coach_id is not null or mo.coach_id is not null then 'Independent coach' else 'Organization' end)::text,
    coalesce(w.workspace_type,case when cfa.coach_id is not null or mo.coach_id is not null then 'independent_coach' else 'organization' end)::text,
    a.checkout_type,a.payment_record_id,a.stripe_checkout_session_id,a.stripe_payment_intent_id
  from public.stripe_connect_payment_accounting a
  left join public.business_workspaces w on w.id=a.workspace_id
  left join public.coach_fee_assignments cfa on a.checkout_type='coach_fee' and cfa.id=a.payment_record_id
  left join public.profiles cp on cp.id=cfa.coach_id
  left join public.marketplace_orders mo on a.checkout_type in ('mobile_marketplace','marketplace') and mo.id=a.payment_record_id
  left join public.marketplace_items mi on mi.id=mo.item_id
  left join public.profiles mcp on mcp.id=mo.coach_id
  left join public.organizations mo_org on mo_org.id=mo.org_id
  left join public.org_fee_assignments ofa on a.checkout_type='org_fee' and ofa.id=a.payment_record_id
  left join public.org_fees ofee on ofee.id=ofa.fee_id
  left join public.organizations o on o.id=ofee.org_id
  where a.livemode=true
    and coalesce(w.is_test,false)=false
    and coalesce(cp.is_test,false)=false
    and coalesce(mcp.is_test,false)=false
    and coalesce(o.is_test,false)=false
    and coalesce(mo_org.is_test,false)=false
  order by a.created_at desc limit 5000;
end $$;

revoke all on function public.admin_set_user_test_status(uuid,boolean,text),
  public.admin_set_organization_test_status(uuid,boolean,text) from public,anon;
grant execute on function public.admin_set_user_test_status(uuid,boolean,text),
  public.admin_set_organization_test_status(uuid,boolean,text) to authenticated;

create or replace function public.admin_insights_summary()
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  select jsonb_build_object(
    'gross_volume_cents',coalesce((select sum(a.gross_amount_cents) from public.stripe_connect_payment_accounting a left join public.business_workspaces w on w.id=a.workspace_id where a.livemode=true and coalesce(w.is_test,false)=false),0),
    'platform_fee_cents',coalesce((select sum(a.platform_fee_cents) from public.stripe_connect_payment_accounting a left join public.business_workspaces w on w.id=a.workspace_id where a.livemode=true and coalesce(w.is_test,false)=false),0),
    'seller_net_cents',coalesce((select sum(a.net_amount_cents) from public.stripe_connect_payment_accounting a left join public.business_workspaces w on w.id=a.workspace_id where a.livemode=true and coalesce(w.is_test,false)=false),0),
    'refunded_amount_cents',coalesce((select sum(round(r.amount*100)) from public.payment_refund_requests r left join public.profiles p on p.id=r.requester_id where r.status='refunded' and coalesce(p.is_test,false)=false),0),
    'mrr_cents',coalesce((select sum(case when s.billing_interval='year' then coalesce(s.renewal_amount_cents,0)/12.0 else coalesce(s.renewal_amount_cents,0) end) from public.platform_subscriptions s left join public.business_workspaces w on w.id=s.workspace_id left join public.profiles p on p.id=s.user_id where s.status in ('active','trialing') and coalesce(w.is_test,false)=false and coalesce(p.is_test,false)=false and (s.purchase_channel is distinct from 'apple_iap' or lower(coalesce(s.apple_environment,''))='production')),0),
    'active_subscriptions',(select count(*) from public.platform_subscriptions s left join public.business_workspaces w on w.id=s.workspace_id left join public.profiles p on p.id=s.user_id where s.status='active' and coalesce(w.is_test,false)=false and coalesce(p.is_test,false)=false and (s.purchase_channel is distinct from 'apple_iap' or lower(coalesce(s.apple_environment,''))='production')),
    'trials',(select count(*) from public.platform_subscriptions s left join public.business_workspaces w on w.id=s.workspace_id left join public.profiles p on p.id=s.user_id where s.status='trialing' and coalesce(w.is_test,false)=false and coalesce(p.is_test,false)=false and (s.purchase_channel is distinct from 'apple_iap' or lower(coalesce(s.apple_environment,''))='production')),
    'past_due',(select count(*) from public.platform_subscriptions s left join public.business_workspaces w on w.id=s.workspace_id left join public.profiles p on p.id=s.user_id where s.status in ('past_due','unpaid') and coalesce(w.is_test,false)=false and coalesce(p.is_test,false)=false),
    'canceled_30d',(select count(*) from public.platform_subscriptions s left join public.business_workspaces w on w.id=s.workspace_id left join public.profiles p on p.id=s.user_id where s.status='canceled' and s.updated_at>=now()-interval '30 days' and coalesce(w.is_test,false)=false and coalesce(p.is_test,false)=false),
    'accounts',(select count(*) from public.profiles where is_test=false),
    'workspaces',(select count(*) from public.business_workspaces where status='active' and is_test=false),
    'paid_accounts',(select count(*) from public.platform_subscriptions s left join public.business_workspaces w on w.id=s.workspace_id left join public.profiles p on p.id=s.user_id where s.status='active' and coalesce(w.is_test,false)=false and coalesce(p.is_test,false)=false),
    'failed_webhooks_24h',(select count(*) from public.stripe_webhook_events where status='failed' and received_at>=now()-interval '24 hours'),
    'processing_webhooks_24h',(select count(*) from public.stripe_webhook_events where status='processing' and received_at>=now()-interval '24 hours'),
    'failed_pushes_24h',(select count(*) from public.push_notification_deliveries where status<>'delivered' and created_at>=now()-interval '24 hours'),
    'delivered_pushes_24h',(select count(*) from public.push_notification_deliveries where status='delivered' and created_at>=now()-interval '24 hours'),
    'failed_handoffs_24h',(select count(*) from public.mobile_checkout_handoffs h left join public.profiles p on p.id=h.user_id where h.last_error is not null and h.created_at>=now()-interval '24 hours' and coalesce(p.is_test,false)=false),
    'open_support',(select count(*) from public.support_tickets t left join public.profiles p on p.id=t.user_id where t.status in ('open','in_progress') and coalesce(p.is_test,false)=false),
    'urgent_support',(select count(*) from public.support_tickets t left join public.profiles p on p.id=t.user_id where t.status in ('open','in_progress') and t.priority in ('high','urgent') and coalesce(p.is_test,false)=false)
  ) into result;
  return result;
end $$;
