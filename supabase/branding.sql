-- Branding fields for coach profiles
alter table if exists public.profiles
  add column if not exists brand_logo_url text,
  add column if not exists brand_cover_url text,
  add column if not exists brand_primary_color text,
  add column if not exists brand_accent_color text;

-- Branding fields for org settings
alter table if exists public.org_settings
  add column if not exists brand_logo_url text,
  add column if not exists brand_cover_url text,
  add column if not exists brand_primary_color text,
  add column if not exists brand_accent_color text;
