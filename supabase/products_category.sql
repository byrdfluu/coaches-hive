-- Add category column to marketplace products for coach-facing product labels
alter table if exists public.products
  add column if not exists category text;
