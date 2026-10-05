-- Authoritative Superadmin financial reporting.
-- Dollar-valued RPC fields are retained for mobile backward compatibility;
-- admin_insights_summary remains cents-based.

drop function if exists public.admin_revenue_summary();
create function public.admin_revenue_summary()
returns table(
  total_revenue numeric,
  month_revenue numeric,
  subscription_revenue numeric,
  platform_service_fee_revenue numeric,
  platform_fee_revenue numeric,
  service_fee_revenue numeric,
  refunded_revenue numeric,
  stripe_fees_absorbed numeric,
  dispute_losses numeric,
  net_revenue numeric,
  pending_revenue numeric,
  available_revenue numeric,
  transaction_count bigint
)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;

  return query
  with connect_rows as (
    select
      a.created_at,
      greatest(coalesce(a.platform_fee_cents,0),0)::numeric platform_cents,
      greatest(coalesce(a.service_fee_cents,0),0)::numeric service_cents,
      least(
        greatest(coalesce(a.platform_fee_cents,0)+coalesce(a.service_fee_cents,0),0),
        case when coalesce(a.gross_amount_cents,0)>0 then
          round(greatest(coalesce(a.platform_fee_cents,0)+coalesce(a.service_fee_cents,0),0)::numeric
            * greatest(coalesce(a.refunded_amount_cents,0),0)::numeric / a.gross_amount_cents)
        else 0 end
      ) refunded_owned_cents,
      least(
        greatest(coalesce(a.platform_fee_cents,0)+coalesce(a.service_fee_cents,0),0),
        case when coalesce(a.gross_amount_cents,0)>0 then
          round(greatest(coalesce(a.platform_fee_cents,0)+coalesce(a.service_fee_cents,0),0)::numeric
            * greatest(coalesce(a.dispute_amount_cents,0),0)::numeric / a.gross_amount_cents)
        else 0 end
      ) dispute_owned_cents,
      greatest(
        greatest(coalesce(a.platform_fee_cents,0)+coalesce(a.service_fee_cents,0),0)
          - coalesce(a.coaches_hive_net_amount_cents,
              greatest(coalesce(a.platform_fee_cents,0)+coalesce(a.service_fee_cents,0),0)),
        0
      ) stripe_absorbed_cents,
      lower(coalesce(tx.status,'succeeded')) payment_status,
      lower(coalesce(a.stripe_metadata->>'payout_status','')) payout_status
    from public.stripe_connect_payment_accounting a
    left join public.business_workspaces w on w.id=a.workspace_id
    left join public.organizations o on o.id=a.organization_id
    left join public.payment_transactions tx on tx.stripe_payment_intent_id=a.stripe_payment_intent_id
    left join public.profiles payer on payer.id=tx.payer_id
    left join public.athlete_profiles athlete on athlete.id=tx.athlete_profile_id
    where a.livemode=true
      and coalesce(w.is_test,false)=false
      and coalesce(o.is_test,false)=false
      and coalesce(payer.is_test,false)=false
      and coalesce(athlete.is_test,false)=false
  ), subscription_rows as (
    select
      tx.occurred_at created_at,
      greatest(coalesce(tx.gross_amount_cents,tx.amount_cents,0),0)::numeric subscription_cents,
      greatest(coalesce(tx.refunded_amount_cents,0),0)::numeric refunded_cents,
      greatest(coalesce(tx.stripe_processing_fee_cents,0),0)::numeric stripe_cents,
      lower(coalesce(tx.status,'pending')) payment_status
    from public.payment_transactions tx
    left join public.profiles payer on payer.id=tx.payer_id
    left join public.business_workspaces w on w.id=nullif(tx.metadata->>'workspace_id','')::uuid
    where lower(coalesce(tx.source_record_type,'')) in ('platform_subscription','platform_subscription_renewal','subscription','subscription_renewal')
      and coalesce(tx.is_off_platform,false)=false
      and coalesce(payer.is_test,false)=false
      and coalesce(w.is_test,false)=false
      and lower(coalesce(tx.metadata->>'livemode','true'))<>'false'
  ), totals as (
    select
      coalesce(sum(platform_cents+service_cents),0) connect_owned,
      coalesce(sum(platform_cents),0) platform_owned,
      coalesce(sum(service_cents),0) service_owned,
      coalesce(sum(refunded_owned_cents),0) connect_refunded,
      coalesce(sum(stripe_absorbed_cents),0) connect_stripe,
      coalesce(sum(dispute_owned_cents),0) connect_disputes,
      coalesce(sum(platform_cents+service_cents) filter(where created_at>=date_trunc('month',now())),0) connect_month,
      coalesce(sum(platform_cents+service_cents) filter(where payment_status in ('pending','processing')),0) connect_pending,
      coalesce(sum(platform_cents+service_cents-refunded_owned_cents-dispute_owned_cents-stripe_absorbed_cents)
        filter(where payment_status in ('succeeded','paid','complete','completed') and payout_status not in ('pending','in_transit')),0) connect_available,
      count(*) connect_count
    from connect_rows
  ), subscriptions as (
    select
      coalesce(sum(subscription_cents) filter(where payment_status in ('succeeded','paid','complete','completed','partially_refunded','refunded')),0) subscription_owned,
      coalesce(sum(subscription_cents) filter(where created_at>=date_trunc('month',now()) and payment_status in ('succeeded','paid','complete','completed','partially_refunded','refunded')),0) subscription_month,
      coalesce(sum(refunded_cents),0) subscription_refunded,
      coalesce(sum(stripe_cents),0) subscription_stripe,
      coalesce(sum(subscription_cents) filter(where payment_status in ('pending','processing')),0) subscription_pending,
      coalesce(sum(subscription_cents-refunded_cents-stripe_cents) filter(where payment_status in ('succeeded','paid','complete','completed','partially_refunded','refunded')),0) subscription_available,
      count(*) filter(where payment_status not in ('failed','canceled')) subscription_count
    from subscription_rows
  )
  select
    (t.connect_owned+s.subscription_owned)/100,
    (t.connect_month+s.subscription_month)/100,
    s.subscription_owned/100,
    t.connect_owned/100,
    t.platform_owned/100,
    t.service_owned/100,
    (t.connect_refunded+s.subscription_refunded)/100,
    (t.connect_stripe+s.subscription_stripe)/100,
    t.connect_disputes/100,
    (t.connect_owned+s.subscription_owned-t.connect_refunded-s.subscription_refunded-t.connect_stripe-s.subscription_stripe-t.connect_disputes)/100,
    (t.connect_pending+s.subscription_pending)/100,
    (t.connect_available+s.subscription_available)/100,
    t.connect_count+s.subscription_count
  from totals t cross join subscriptions s;
end $$;

comment on function public.admin_revenue_summary() is
  'Dollar amounts. total_revenue/month_revenue are Coaches Hive-owned platform, service-fee, and realized subscription revenue; never seller GMV.';

drop function if exists public.admin_revenue_ledger();
create function public.admin_revenue_ledger()
returns table(
  id uuid,
  description text,
  amount numeric,
  created_at timestamptz,
  owner_name text,
  owner_type text,
  checkout_type text,
  payment_record_id uuid,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  payer_name text,
  athlete_name text,
  team_name text,
  payment_status text,
  currency text,
  customer_total numeric,
  service_fee numeric,
  platform_fee numeric,
  stripe_fee numeric,
  organization_net numeric,
  refunded_amount numeric,
  payout_status text
)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;

  return query
  select
    a.id,
    coalesce(nullif(tx.description,''),
      case when a.checkout_type='coach_fee' then coalesce(cfa.name,'Independent coach transaction')
        when a.checkout_type in ('mobile_marketplace','marketplace') then coalesce(mi.name,'Marketplace transaction')
        when a.checkout_type='org_fee' then coalesce(ofee.name,'Organization fee')
        else initcap(replace(a.checkout_type,'_',' ')) end)::text,
    coalesce(a.total_amount_cents,a.gross_amount_cents)::numeric/100,
    coalesce(tx.occurred_at,a.created_at),
    coalesce(w.display_name,cp.full_name,mcp.full_name,o.name,mo_org.name,
      case when cfa.coach_id is not null or mo.coach_id is not null then 'Independent coach' else 'Organization' end)::text,
    coalesce(w.workspace_type,case when cfa.coach_id is not null or mo.coach_id is not null then 'independent_coach' else 'organization' end)::text,
    a.checkout_type,a.payment_record_id,a.stripe_checkout_session_id,a.stripe_payment_intent_id,
    nullif(coalesce(payer.full_name,payer.email),'')::text,
    athlete.full_name::text,
    team.name::text,
    case
      when coalesce(a.refunded_amount_cents,tx.refunded_amount_cents,0)>=coalesce(a.total_amount_cents,a.gross_amount_cents) then 'refunded'
      when coalesce(a.refunded_amount_cents,tx.refunded_amount_cents,0)>0 then 'partially_refunded'
      when coalesce(a.dispute_amount_cents,0)>0 then 'disputed'
      else coalesce(tx.status,'succeeded') end::text,
    lower(coalesce(a.currency,tx.currency,'usd'))::text,
    coalesce(a.total_amount_cents,a.gross_amount_cents)::numeric/100,
    coalesce(a.service_fee_cents,0)::numeric/100,
    coalesce(a.platform_fee_cents,0)::numeric/100,
    coalesce(a.stripe_processing_fee_cents,tx.stripe_processing_fee_cents,0)::numeric/100,
    coalesce(a.organization_net_amount_cents,a.recipient_net_amount_cents,a.net_amount_cents,0)::numeric/100,
    coalesce(a.refunded_amount_cents,tx.refunded_amount_cents,0)::numeric/100,
    coalesce(nullif(a.stripe_metadata->>'payout_status',''),
      case when a.stripe_transfer_id is not null then 'transferred' else 'not_returned' end)::text
  from public.stripe_connect_payment_accounting a
  left join public.payment_transactions tx on tx.stripe_payment_intent_id=a.stripe_payment_intent_id
  left join public.profiles payer on payer.id=tx.payer_id
  left join public.athlete_profiles athlete on athlete.id=tx.athlete_profile_id
  left join public.org_teams team on team.id=tx.team_id
  left join public.business_workspaces w on w.id=a.workspace_id
  left join public.coach_fee_assignments cfa on a.checkout_type='coach_fee' and cfa.id=a.payment_record_id
  left join public.profiles cp on cp.id=cfa.coach_id
  left join public.marketplace_orders mo on a.checkout_type in ('mobile_marketplace','marketplace') and mo.id=a.payment_record_id
  left join public.marketplace_items mi on mi.id=mo.item_id
  left join public.profiles mcp on mcp.id=mo.coach_id
  left join public.organizations mo_org on mo_org.id=mo.org_id
  left join public.org_fee_assignments ofa on a.checkout_type='org_fee' and ofa.id=a.payment_record_id
  left join public.org_fees ofee on ofee.id=ofa.fee_id
  left join public.organizations o on o.id=coalesce(a.organization_id,ofee.org_id)
  where a.livemode=true
    and coalesce(w.is_test,false)=false and coalesce(o.is_test,false)=false
    and coalesce(cp.is_test,false)=false and coalesce(mcp.is_test,false)=false
    and coalesce(mo_org.is_test,false)=false and coalesce(payer.is_test,false)=false
    and coalesce(athlete.is_test,false)=false

  union all

  select tx.id,tx.description,tx.gross_amount_cents::numeric/100,tx.occurred_at,
    'Coaches Hive'::text,'platform'::text,coalesce(tx.source_record_type,'platform_subscription')::text,
    tx.source_record_id,null::text,tx.stripe_payment_intent_id,
    nullif(coalesce(payer.full_name,payer.email),'')::text,athlete.full_name::text,team.name::text,
    tx.status,lower(tx.currency),tx.gross_amount_cents::numeric/100,0::numeric,
    tx.gross_amount_cents::numeric/100,coalesce(tx.stripe_processing_fee_cents,0)::numeric/100,
    0::numeric,tx.refunded_amount_cents::numeric/100,
    coalesce(nullif(tx.metadata->>'payout_status',''),'not_applicable')::text
  from public.payment_transactions tx
  left join public.profiles payer on payer.id=tx.payer_id
  left join public.athlete_profiles athlete on athlete.id=tx.athlete_profile_id
  left join public.org_teams team on team.id=tx.team_id
  left join public.business_workspaces w on w.id=nullif(tx.metadata->>'workspace_id','')::uuid
  where lower(coalesce(tx.source_record_type,'')) in ('platform_subscription','platform_subscription_renewal','subscription','subscription_renewal')
    and coalesce(tx.is_off_platform,false)=false
    and coalesce(payer.is_test,false)=false and coalesce(athlete.is_test,false)=false and coalesce(w.is_test,false)=false
    and lower(coalesce(tx.metadata->>'livemode','true'))<>'false'
    and not exists(select 1 from public.stripe_connect_payment_accounting a where a.stripe_payment_intent_id=tx.stripe_payment_intent_id)
  order by 4 desc limit 5000;
end $$;

comment on function public.admin_revenue_ledger() is
  'Dollar amounts. One authoritative payment row per Stripe PaymentIntent; test identities and workspaces are excluded.';

revoke all on function public.admin_revenue_summary(),public.admin_revenue_ledger() from public,anon;
grant execute on function public.admin_revenue_summary(),public.admin_revenue_ledger() to authenticated;

notify pgrst,'reload schema';
