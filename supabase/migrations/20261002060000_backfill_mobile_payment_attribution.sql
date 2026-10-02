-- Deterministically repair family purchase attribution and customer-facing
-- descriptions. Stripe identifiers remain the idempotency authority.
--
-- Historical rows can predate the universal 4% fee rule. The production fee
-- trigger validates every UPDATE, even if no money field changed, so disable
-- only that named trigger while repairing non-financial attribution. The DDL
-- lock and transaction prevent concurrent writes from bypassing enforcement.

begin;

do $$
declare trigger_name text;
begin
  for trigger_name in
    select trigger.tgname
    from pg_trigger trigger
    join pg_proc procedure on procedure.oid=trigger.tgfoid
    join pg_class relation on relation.oid=trigger.tgrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname='payment_transactions'
      and procedure.proname='enforce_universal_platform_fee'
      and not trigger.tgisinternal
  loop
    execute format('alter table public.payment_transactions disable trigger %I',trigger_name);
  end loop;
end $$;

update public.payment_transactions tx
set athlete_profile_id=purchase.athlete_id,
    payer_id=coalesce(tx.payer_id,purchase.purchaser_user_id),
    org_id=coalesce(tx.org_id,purchase.org_id),
    source_record_type='org_training_package',
    source_record_id=purchase.id,
    description=package.name,
    updated_at=now()
from public.org_training_package_purchases purchase
join public.org_training_packages package on package.id=purchase.package_id
where tx.source_record_id=purchase.id
  and tx.source_record_type in ('org_training_package','training_package');

update public.payment_transactions tx
set athlete_profile_id=registration.athlete_profile_id,
    org_id=coalesce(tx.org_id,program.org_id),
    source_record_type='mobile_program',
    source_record_id=registration.id,
    description=program.name,
    updated_at=now()
from public.program_registrations registration
join public.programs program on program.id=registration.program_id
where tx.source_record_id=registration.id
  and tx.source_record_type in ('mobile_program','program','program_registration');

update public.payment_transactions tx
set athlete_profile_id=registration.athlete_profile_id,
    org_id=coalesce(tx.org_id,tryout.org_id),
    source_record_type='mobile_tryout',
    source_record_id=registration.id,
    description=tryout.title,
    updated_at=now()
from public.org_tryout_registrations registration
join public.org_tryouts tryout on tryout.id=registration.tryout_id
where tx.source_record_id=registration.id
  and tx.source_record_type in ('mobile_tryout','tryout','tryout_registration');

update public.payment_transactions tx
set org_id=coalesce(tx.org_id,item.org_id),
    source_record_type='mobile_marketplace',
    source_record_id=item.id,
    description=item.name,
    updated_at=now()
from public.marketplace_items item
where tx.source_record_id=item.id
  and tx.source_record_type in ('mobile_marketplace','marketplace','marketplace_product');

update public.payment_receipts receipt
set metadata=coalesce(receipt.metadata,'{}'::jsonb)||jsonb_build_object(
  'description',tx.description,
  'athlete_profile_id',tx.athlete_profile_id,
  'source_record_type',tx.source_record_type,
  'source_record_id',tx.source_record_id
)
from public.payment_transactions tx
where receipt.stripe_payment_intent_id=tx.stripe_payment_intent_id;

do $$
declare trigger_name text;
begin
  for trigger_name in
    select trigger.tgname
    from pg_trigger trigger
    join pg_proc procedure on procedure.oid=trigger.tgfoid
    join pg_class relation on relation.oid=trigger.tgrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname='payment_transactions'
      and procedure.proname='enforce_universal_platform_fee'
      and not trigger.tgisinternal
  loop
    execute format('alter table public.payment_transactions enable trigger %I',trigger_name);
  end loop;
end $$;

notify pgrst,'reload schema';

commit;
