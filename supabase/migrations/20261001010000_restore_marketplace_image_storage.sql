-- Restore the public marketplace image bucket in environments where the
-- original marketplace migration was partially applied.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketplace-items',
  'marketplace-items',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Marketplace images public read v2" on storage.objects;
create policy "Marketplace images public read v2"
on storage.objects for select
using (bucket_id = 'marketplace-items');

drop policy if exists "Marketplace images authenticated insert v2" on storage.objects;
create policy "Marketplace images authenticated insert v2"
on storage.objects for insert to authenticated
with check (bucket_id = 'marketplace-items');

drop policy if exists "Marketplace images owner update v2" on storage.objects;
create policy "Marketplace images owner update v2"
on storage.objects for update to authenticated
using (bucket_id = 'marketplace-items' and owner_id::text = auth.uid()::text)
with check (bucket_id = 'marketplace-items' and owner_id::text = auth.uid()::text);

drop policy if exists "Marketplace images owner delete v2" on storage.objects;
create policy "Marketplace images owner delete v2"
on storage.objects for delete to authenticated
using (bucket_id = 'marketplace-items' and owner_id::text = auth.uid()::text);

