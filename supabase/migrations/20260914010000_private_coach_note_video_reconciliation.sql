-- Reconcile the private note-video contract shared by iOS and web.
-- Safe when the original iOS migration has already created these objects.

alter table public.coach_notes add column if not exists attachment_type text;
alter table public.coach_notes add column if not exists attachment_storage_path text;
alter table public.coach_notes add column if not exists attachment_file_name text;
alter table public.coach_notes add column if not exists attachment_content_type text;
alter table public.coach_notes add column if not exists attachment_size_bytes bigint;
alter table public.coach_notes add column if not exists attachment_duration_seconds numeric;

alter table public.coach_notes drop constraint if exists coach_notes_private_video_check;
alter table public.coach_notes add constraint coach_notes_private_video_check check (
  attachment_storage_path is null or (
    attachment_type = 'video'
    and attachment_content_type in ('video/mp4','video/quicktime','video/x-m4v')
    and attachment_size_bytes between 1 and 209715200
    and attachment_duration_seconds between 0 and 180
  )
);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('private-athlete-media','private-athlete-media',false,209715200,
  array['video/mp4','video/quicktime','video/x-m4v'])
on conflict (id) do update set public=false,file_size_limit=209715200,
  allowed_mime_types=array['video/mp4','video/quicktime','video/x-m4v'];

drop policy if exists private_athlete_media_insert on storage.objects;
create policy private_athlete_media_insert on storage.objects for insert to authenticated
with check (bucket_id='private-athlete-media' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists private_athlete_media_select on storage.objects;
create policy private_athlete_media_select on storage.objects for select to authenticated
using (bucket_id='private-athlete-media' and (
  exists (select 1 from public.messages m where m.attachment_storage_path=name
    and public.is_thread_participant(m.thread_id))
  or exists (select 1 from public.coach_notes n
    left join public.athlete_profiles ap on ap.id=n.athlete_id
    where n.attachment_storage_path=name
      and (n.coach_id=auth.uid() or (not n.is_private and ap.owner_user_id=auth.uid())))
));

drop policy if exists private_athlete_media_delete on storage.objects;
create policy private_athlete_media_delete on storage.objects for delete to authenticated
using (bucket_id='private-athlete-media' and (storage.foldername(name))[1]=auth.uid()::text);
