-- Canonical marketplace media contract shared by web and iOS.
-- Persist object paths and file metadata; generated signed URLs remain transient.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('product-media', 'product-media', false, 20971520,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/x-m4v'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table if exists public.products
  add column if not exists media_storage_path text,
  add column if not exists media_filename text,
  add column if not exists media_mime_type text,
  add column if not exists media_size_bytes bigint;

alter table if exists public.marketplace_items
  add column if not exists image_storage_path text,
  add column if not exists image_filename text,
  add column if not exists image_mime_type text,
  add column if not exists image_size_bytes bigint;

alter table if exists public.products drop constraint if exists products_media_size_bytes_check;
alter table if exists public.products add constraint products_media_size_bytes_check
  check (media_size_bytes is null or media_size_bytes between 1 and 20971520);
alter table if exists public.marketplace_items drop constraint if exists marketplace_items_image_size_bytes_check;
alter table if exists public.marketplace_items add constraint marketplace_items_image_size_bytes_check
  check (image_size_bytes is null or image_size_bytes between 1 and 20971520);

update public.products set media_storage_path = media_url
where media_storage_path is null and media_url is not null and media_url !~* '^https?://';
update public.marketplace_items set image_storage_path = image_url
where image_storage_path is null and image_url is not null and image_url !~* '^https?://';

create or replace function public.sync_marketplace_media_metadata()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if tg_table_name = 'products' then
    update public.marketplace_items
    set image_url = coalesce(new.media_storage_path, new.media_url),
        image_storage_path = coalesce(new.media_storage_path, case when new.media_url !~* '^https?://' then new.media_url end),
        image_filename = new.media_filename, image_mime_type = new.media_mime_type,
        image_size_bytes = new.media_size_bytes, updated_at = now()
    where id = new.id;
  else
    update public.products
    set media_url = coalesce(new.image_storage_path, new.image_url),
        media_storage_path = coalesce(new.image_storage_path, case when new.image_url !~* '^https?://' then new.image_url end),
        media_filename = new.image_filename, media_mime_type = new.image_mime_type,
        media_size_bytes = new.image_size_bytes, updated_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_products_sync_marketplace_media_metadata on public.products;
create trigger zz_products_sync_marketplace_media_metadata
after insert or update of media_url, media_storage_path, media_filename, media_mime_type, media_size_bytes
on public.products for each row execute function public.sync_marketplace_media_metadata();
drop trigger if exists zz_marketplace_items_sync_product_media_metadata on public.marketplace_items;
create trigger zz_marketplace_items_sync_product_media_metadata
after insert or update of image_url, image_storage_path, image_filename, image_mime_type, image_size_bytes
on public.marketplace_items for each row execute function public.sync_marketplace_media_metadata();

update public.marketplace_items mi
set image_storage_path = coalesce(mi.image_storage_path, p.media_storage_path, case when p.media_url !~* '^https?://' then p.media_url end),
    image_filename = coalesce(mi.image_filename, p.media_filename),
    image_mime_type = coalesce(mi.image_mime_type, p.media_mime_type),
    image_size_bytes = coalesce(mi.image_size_bytes, p.media_size_bytes)
from public.products p where p.id = mi.id;
update public.products p
set media_storage_path = coalesce(p.media_storage_path, mi.image_storage_path, case when mi.image_url !~* '^https?://' then mi.image_url end),
    media_filename = coalesce(p.media_filename, mi.image_filename),
    media_mime_type = coalesce(p.media_mime_type, mi.image_mime_type),
    media_size_bytes = coalesce(p.media_size_bytes, mi.image_size_bytes)
from public.marketplace_items mi where mi.id = p.id;

comment on column public.products.media_storage_path is 'Durable object path in the private product-media bucket; never a signed URL.';
comment on column public.marketplace_items.image_storage_path is 'Durable object path in the private product-media bucket; never a signed URL.';

drop policy if exists "product media authenticated upload" on storage.objects;
create policy "product media authenticated upload" on storage.objects for insert to authenticated
with check (bucket_id = 'product-media' and owner_id::text = auth.uid()::text);

drop policy if exists "product media authorized read" on storage.objects;
create policy "product media authorized read" on storage.objects for select to authenticated
using (
  bucket_id = 'product-media' and (
    owner_id::text = auth.uid()::text
    or exists (
      select 1 from public.products p
      where coalesce(p.media_storage_path, p.media_url) = storage.objects.name
        and (
          p.status = 'published'
          or p.coach_id = auth.uid()
          or exists (
            select 1 from public.organization_memberships om
            where om.org_id = p.org_id and om.user_id = auth.uid() and om.status = 'active'
          )
        )
    )
    or exists (
      select 1 from public.coach_exercises ce
      where (storage.objects.name = ce.thumbnail_path or coalesce(to_jsonb(ce.photo_paths), '[]'::jsonb) ? storage.objects.name)
        and (
          ce.coach_id = auth.uid()
          or exists (
            select 1
            from public.coach_program_exercises cpe
            join public.coach_programs cp on cp.id = cpe.program_id
            join public.orders o on o.product_id = cp.product_id
            where cpe.exercise_id = ce.id
              and cp.status = 'active'
              and o.athlete_id = auth.uid()
              and o.status in ('paid', 'active', 'approved')
          )
        )
    )
    or exists (
      select 1 from public.coach_programs cp
      where storage.objects.name = cp.thumbnail_path
        and (
          cp.coach_id = auth.uid()
          or exists (
            select 1 from public.orders o
            where o.product_id = cp.product_id
              and o.athlete_id = auth.uid()
              and o.status in ('paid', 'active', 'approved')
          )
        )
    )
  )
);

drop policy if exists "product media owner update" on storage.objects;
create policy "product media owner update" on storage.objects for update to authenticated
using (bucket_id = 'product-media' and owner_id::text = auth.uid()::text)
with check (bucket_id = 'product-media' and owner_id::text = auth.uid()::text);

drop policy if exists "product media owner delete" on storage.objects;
create policy "product media owner delete" on storage.objects for delete to authenticated
using (bucket_id = 'product-media' and owner_id::text = auth.uid()::text);
