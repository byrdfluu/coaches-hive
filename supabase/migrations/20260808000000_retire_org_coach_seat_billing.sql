-- Organization coaches are included under Starter and Growth.
-- Keep historical Stripe identifiers for auditability, but prevent application
-- code and reporting from treating any coach quantity as separately billable.
update public.platform_subscriptions
set included_coach_quantity = 0,
    billable_coach_quantity = 0,
    stripe_coach_seat_item_id = null,
    updated_at = now()
where owner_type = 'org';

comment on column public.platform_subscriptions.stripe_coach_seat_item_id is
  'Retired 2026-08-08. Historical schema only; organization coaches are included.';
comment on column public.platform_subscriptions.billable_coach_quantity is
  'Retired 2026-08-08. Must remain zero; organization coaches are included.';
