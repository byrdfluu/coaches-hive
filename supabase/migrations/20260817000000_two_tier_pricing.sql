-- Canonical two-tier pricing model. Existing rows are updated in place; no
-- subscription, profile, organization, or Apple purchase history is deleted.

alter table public.platform_subscriptions
  add column if not exists plan_type text,
  add column if not exists processing_fee_rate numeric(5,4) not null default 0.04;

alter table public.platform_subscriptions
  drop constraint if exists platform_subscriptions_plan_type_check,
  add constraint platform_subscriptions_plan_type_check
    check (plan_type in ('individual_coach', 'organization')),
  drop constraint if exists platform_subscriptions_processing_fee_rate_check,
  add constraint platform_subscriptions_processing_fee_rate_check
    check (processing_fee_rate >= 0 and processing_fee_rate <= 1);

alter table public.org_settings
  add column if not exists processing_fee_rate numeric(5,4) not null default 0.04;

alter table public.org_settings
  drop constraint if exists org_settings_processing_fee_rate_check,
  add constraint org_settings_processing_fee_rate_check
    check (processing_fee_rate >= 0 and processing_fee_rate <= 1);

-- Every historical coach tier becomes the single Individual Coach plan.
update public.platform_subscriptions
set plan_type = 'individual_coach', tier = 'individual_coach', processing_fee_rate = 0.04,
    updated_at = now()
where owner_type = 'coach';

update public.profiles
set plan_tier = 'individual_coach'
where role = 'coach' and plan_tier is not null;

alter table public.coach_plans drop constraint if exists coach_plans_tier_check;
update public.coach_plans set tier = 'individual_coach';
alter table public.coach_plans
  add constraint coach_plans_tier_check check (tier = 'individual_coach');

-- Every historical organization tier becomes the single Organization plan.
update public.platform_subscriptions
set plan_type = 'organization', tier = 'organization', processing_fee_rate = 0.04,
    updated_at = now()
where owner_type = 'org';

alter table public.org_settings drop constraint if exists org_settings_plan_check;
update public.org_settings set plan = 'organization', processing_fee_rate = 0.04;
alter table public.org_settings
  add constraint org_settings_plan_check check (plan = 'organization');

-- Retire athlete platform subscriptions without deleting purchase history.
update public.platform_subscriptions
set status = 'canceled', cancel_at_period_end = false, updated_at = now()
where owner_type = 'athlete' and status <> 'canceled';

-- Replace legacy variable fee rules with the universal Individual Coach rate.
update public.platform_fee_rules set percentage = 4 where active = true;

comment on column public.platform_subscriptions.plan_type is
  'Canonical entitlement: individual_coach or organization.';
comment on column public.platform_subscriptions.processing_fee_rate is
  'Stripe Connect platform fee as a decimal. Subscription discounts do not alter this value.';
comment on column public.org_settings.processing_fee_rate is
  'Organization Stripe Connect platform fee as a decimal; default 0.04, manually set to 0.03 for approved founding members.';
