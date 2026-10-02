-- Canonical persisted images for family-visible organization offerings.
-- Store a durable public URL, or storage://<bucket>/<object-path> for private
-- objects that the API must sign when it builds the storefront response.

alter table if exists public.programs add column if not exists image_url text;
alter table if exists public.org_tryouts add column if not exists image_url text;
alter table if exists public.sessions add column if not exists image_url text;
alter table if exists public.org_training_packages add column if not exists image_url text;
alter table if exists public.org_fees add column if not exists image_url text;
alter table if exists public.organization_recurring_fee_offers add column if not exists image_url text;

comment on column public.programs.image_url is 'Durable public URL or storage://bucket/object-path; never an expiring signed URL.';
comment on column public.org_tryouts.image_url is 'Durable public URL or storage://bucket/object-path; never an expiring signed URL.';
comment on column public.sessions.image_url is 'Durable public URL or storage://bucket/object-path; never an expiring signed URL.';
comment on column public.org_training_packages.image_url is 'Durable public URL or storage://bucket/object-path; never an expiring signed URL.';
comment on column public.org_fees.image_url is 'Durable public URL or storage://bucket/object-path; never an expiring signed URL.';
comment on column public.organization_recurring_fee_offers.image_url is 'Durable public URL or storage://bucket/object-path; never an expiring signed URL.';

notify pgrst, 'reload schema';
