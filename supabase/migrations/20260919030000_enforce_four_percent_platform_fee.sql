-- Enforce the public 4% platform-fee contract across every online payment type.
-- Stripe's processing fee remains separately accounted for in integer cents.

update public.org_settings
set processing_fee_rate = 0.04
where processing_fee_rate is distinct from 0.04;

alter table public.org_settings
  alter column processing_fee_rate set default 0.04,
  drop constraint if exists org_settings_processing_fee_rate_check,
  add constraint org_settings_processing_fee_rate_check
    check (processing_fee_rate = 0.04);

update public.platform_subscriptions
set processing_fee_rate = 0.04
where processing_fee_rate is distinct from 0.04;

alter table public.platform_subscriptions
  alter column processing_fee_rate set default 0.04,
  drop constraint if exists platform_subscriptions_processing_fee_rate_check,
  add constraint platform_subscriptions_processing_fee_rate_check
    check (processing_fee_rate = 0.04);

update public.platform_fee_rules
set percentage = 4
where percentage is distinct from 4;

update public.admin_configs
set data = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(data, '{}'::jsonb), '{programPlatformFeePercent}', '4'::jsonb, true),
        '{orgFeePlatformFeePercent}', '4'::jsonb, true
      ),
      '{marketplacePlatformFeePercent}', '4'::jsonb, true
    ),
    '{marketplacePlatformFeeCapCents}', '9007199254740991'::jsonb, true
  ),
  '{orgSessionRollingVolumeTiers}', '[{"minimumVolumeCents":0,"feePercent":4}]'::jsonb, true
)
where key = 'fee_settings';

update public.facilities
set marketplace_fee_rate = 0.04,
    marketplace_fee_cap_cents = 2147483647
where marketplace_fee_rate is distinct from 0.04
   or marketplace_fee_cap_cents is distinct from 2147483647;

alter table public.facilities
  alter column marketplace_fee_rate set default 0.04,
  alter column marketplace_fee_cap_cents set default 2147483647,
  drop constraint if exists facilities_marketplace_fee_rate_check,
  add constraint facilities_marketplace_fee_rate_check
    check (marketplace_fee_rate = 0.04),
  drop constraint if exists facilities_marketplace_fee_cap_check,
  add constraint facilities_marketplace_fee_cap_check
    check (marketplace_fee_cap_cents = 2147483647);

comment on column public.org_settings.processing_fee_rate is
  'Server-enforced Coaches Hive platform fee rate. Fixed at 0.04.';
comment on column public.facilities.marketplace_fee_rate is
  'Server-enforced Coaches Hive platform fee rate. Fixed at 0.04.';
comment on column public.facilities.marketplace_fee_cap_cents is
  'Legacy compatibility column. Set to the integer maximum; no facility platform-fee cap is applied.';
