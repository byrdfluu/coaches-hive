-- Add price column to marketplace products
alter table if exists public.products
  add column if not exists price numeric;
