-- Marketplace product delivery assets for digital programs
alter table if exists public.products
  add column if not exists delivery_asset_path text,
  add column if not exists delivery_asset_name text,
  add column if not exists delivery_asset_type text,
  add column if not exists delivery_asset_size bigint,
  add column if not exists delivery_external_url text;
