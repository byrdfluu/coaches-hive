-- Align active upload buckets with the limits enforced by both clients and
-- give coach verification uploads durable, queryable metadata.

create table if not exists public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('gov_id', 'certifications')),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  created_at timestamptz not null default now()
);

create index if not exists verification_documents_owner_category_created_idx
  on public.verification_documents(owner_user_id, category, created_at desc);

alter table public.verification_documents enable row level security;
grant select, insert, delete on public.verification_documents to authenticated;

drop policy if exists verification_documents_owner_read on public.verification_documents;
create policy verification_documents_owner_read on public.verification_documents
for select to authenticated using (
  owner_user_id = auth.uid() or public.is_admin(auth.uid())
);

drop policy if exists verification_documents_owner_insert on public.verification_documents;
create policy verification_documents_owner_insert on public.verification_documents
for insert to authenticated with check (owner_user_id = auth.uid());

drop policy if exists verification_documents_owner_delete on public.verification_documents;
create policy verification_documents_owner_delete on public.verification_documents
for delete to authenticated using (
  owner_user_id = auth.uid() or public.is_admin(auth.uid())
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('attachments','attachments',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']),
  ('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp','image/gif']),
  ('branding','branding',true,10485760,array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('coach-avatars-v2','coach-avatars-v2',true,8388608,array['image/jpeg']),
  ('coach-waivers','coach-waivers',false,20971520,array['application/pdf','image/jpeg','image/png','image/heic','image/heif','text/plain','application/rtf','text/rtf','application/octet-stream']),
  ('org-documents','org-documents',false,20971520,array['application/pdf','image/jpeg','image/png','image/heic','image/heif','text/plain','application/rtf','text/rtf','application/octet-stream']),
  ('profile-gallery','profile-gallery',true,10485760,array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('signed-paperwork','signed-paperwork',false,20971520,array['application/pdf']),
  ('verifications','verifications',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists verification_files_owner_read on storage.objects;
create policy verification_files_owner_read on storage.objects for select to authenticated using (
  bucket_id='verifications' and (
    (storage.foldername(name))[1]=auth.uid()::text or public.is_admin(auth.uid())
  )
);

drop policy if exists verification_files_owner_insert on storage.objects;
create policy verification_files_owner_insert on storage.objects for insert to authenticated with check (
  bucket_id='verifications'
  and (storage.foldername(name))[1]=auth.uid()::text
  and (storage.foldername(name))[2] in ('gov_id','certifications')
);

drop policy if exists verification_files_owner_delete on storage.objects;
create policy verification_files_owner_delete on storage.objects for delete to authenticated using (
  bucket_id='verifications' and (
    (storage.foldername(name))[1]=auth.uid()::text or public.is_admin(auth.uid())
  )
);

-- Preserve metadata for files uploaded before this table existed.
insert into public.verification_documents(
  owner_user_id,category,storage_path,original_filename,mime_type,size_bytes,created_at
)
select
  (storage.foldername(object.name))[1]::uuid,
  (storage.foldername(object.name))[2],
  object.name,
  regexp_replace(object.name, '^.*/', ''),
  coalesce(nullif(object.metadata->>'mimetype',''),'application/octet-stream'),
  greatest(coalesce((object.metadata->>'size')::bigint, 1), 1),
  coalesce(object.created_at, now())
from storage.objects object
join public.profiles profile
  on profile.id::text = (storage.foldername(object.name))[1]
where object.bucket_id='verifications'
  and (storage.foldername(object.name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(object.name))[2] in ('gov_id','certifications')
  and coalesce((object.metadata->>'size')::bigint, 1) <= 20971520
on conflict(storage_path) do nothing;

notify pgrst, 'reload schema';
