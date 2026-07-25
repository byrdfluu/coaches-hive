alter table public.platform_subscriptions
  add column if not exists purchase_channel text;
