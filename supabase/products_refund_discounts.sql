-- Marketplace product metadata for refunds/discounts and scheduling
alter table if exists public.products
  add column if not exists refund_policy text,
  add column if not exists discount_label text,
  add column if not exists sale_price numeric,
  add column if not exists price_label text,
  add column if not exists format text,
  add column if not exists duration text,
  add column if not exists next_available timestamptz,
  add column if not exists includes text[];

-- Org default refund policy for marketplace listings
alter table if exists public.org_settings
  add column if not exists org_refund_policy text;
