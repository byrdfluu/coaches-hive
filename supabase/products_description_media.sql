-- Add description and media_url to marketplace products
alter table if exists public.products
  add column if not exists description text,
  add column if not exists media_url text;
