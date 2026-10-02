begin;

-- Fail on states that can make receipts, access, reporting, or revenue
-- disagree with Stripe. Run only against an isolated staging database.
do $$
declare issue_count bigint;
begin
  if to_regclass('public.stripe_webhook_events') is null then raise exception 'stripe_webhook_events is missing'; end if;
  if to_regclass('public.payment_transactions') is null then raise exception 'payment_transactions is missing'; end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='request_org_training_package_purchase'
  ) then raise exception 'request_org_training_package_purchase(uuid, uuid) is missing'; end if;

  select count(*) into issue_count from public.stripe_webhook_events
  where status in ('failed','processing') and coalesce(received_at,now())<now()-interval '15 minutes';
  if issue_count>0 then raise exception '% Stripe webhook event(s) remain failed/stuck',issue_count; end if;

  select count(*) into issue_count from (
    select event_id from public.stripe_webhook_events where event_id is not null
    group by event_id having count(*)>1
  ) duplicates;
  if issue_count>0 then raise exception '% duplicate Stripe webhook event id(s) found',issue_count; end if;

  select count(*) into issue_count from public.payment_transactions
  where status='succeeded' and (gross_amount_cents is null or gross_amount_cents<0);
  if issue_count>0 then raise exception '% succeeded payment transaction(s) have invalid amounts',issue_count; end if;
end $$;

rollback;
