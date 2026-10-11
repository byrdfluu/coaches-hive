create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  file_path text not null,
  file_url text not null,
  file_name text,
  file_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

alter table if exists public.message_attachments add column if not exists file_path text;
alter table if exists public.message_attachments add column if not exists file_name text;
alter table if exists public.message_attachments add column if not exists file_type text;
alter table if exists public.message_attachments add column if not exists file_size bigint;

create unique index if not exists message_attachments_file_path_key
  on public.message_attachments(file_path) where file_path is not null;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('private-athlete-media','private-athlete-media',false,209715200,
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf','video/mp4','video/quicktime','video/x-m4v'])
on conflict (id) do update set public=false,file_size_limit=209715200,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists private_athlete_media_select on storage.objects;
create policy private_athlete_media_select on storage.objects for select to authenticated
using (bucket_id='private-athlete-media' and (
  exists (select 1 from public.messages m where m.attachment_storage_path=name
    and public.is_thread_participant(m.thread_id))
  or exists (select 1 from public.message_attachments ma join public.messages m on m.id=ma.message_id
    where ma.file_path=name and public.is_thread_participant(m.thread_id))
  or exists (select 1 from public.coach_notes n left join public.athlete_profiles ap on ap.id=n.athlete_id
    where n.attachment_storage_path=name
      and (n.coach_id=auth.uid() or (not n.is_private and ap.owner_user_id=auth.uid())))
));

comment on column public.message_attachments.file_path is
  'Durable object path. Signed URLs must be generated at read time and never persisted here.';
