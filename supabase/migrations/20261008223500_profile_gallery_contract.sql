-- Self-contained profile gallery foundation plus a six-photo limit. Some
-- deployed databases did not receive the original gallery migration.
create extension if not exists pgcrypto;

create table if not exists public.profile_gallery_images (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('coach', 'org')),
  coach_id uuid references public.profiles(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  image_url text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint profile_gallery_images_one_owner check (
    (owner_type = 'coach' and coach_id is not null and org_id is null)
    or (owner_type = 'org' and org_id is not null and coach_id is null)
  )
);

create index if not exists profile_gallery_images_coach_id_created_at_idx
  on public.profile_gallery_images(coach_id, created_at desc);
create index if not exists profile_gallery_images_org_id_created_at_idx
  on public.profile_gallery_images(org_id, created_at desc);

-- A timed-out client may safely retry the metadata write without creating a
-- duplicate row for the same uploaded object.
delete from public.profile_gallery_images older
using public.profile_gallery_images newer
where older.storage_path = newer.storage_path
  and (older.created_at, older.id) < (newer.created_at, newer.id);
create unique index if not exists profile_gallery_images_storage_path_key
  on public.profile_gallery_images(storage_path);

alter table public.profile_gallery_images enable row level security;
grant select on public.profile_gallery_images to anon, authenticated;
grant insert, delete on public.profile_gallery_images to authenticated;

drop policy if exists "Profile gallery images are readable" on public.profile_gallery_images;
create policy "Profile gallery images are readable"
  on public.profile_gallery_images for select to anon, authenticated using (true);

drop policy if exists "Coaches can manage their profile gallery" on public.profile_gallery_images;
create policy "Coaches can manage their profile gallery"
  on public.profile_gallery_images for all to authenticated
  using (coach_id::text = auth.uid()::text)
  with check (owner_type = 'coach' and coach_id::text = auth.uid()::text);

drop policy if exists "Org directors can manage org profile gallery" on public.profile_gallery_images;
create policy "Org directors can manage org profile gallery"
  on public.profile_gallery_images for all to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from public.organization_memberships membership
      where membership.org_id = profile_gallery_images.org_id
        and membership.user_id::text = auth.uid()::text
        and membership.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
        and membership.status = 'active'
    )
  )
  with check (
    owner_type = 'org' and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.organization_memberships membership
        where membership.org_id = profile_gallery_images.org_id
          and membership.user_id::text = auth.uid()::text
          and membership.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
          and membership.status = 'active'
      )
    )
  );

insert into storage.buckets (id, name, public)
values ('profile-gallery', 'profile-gallery', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Profile gallery images are public" on storage.objects;
create policy "Profile gallery images are public"
  on storage.objects for select
  using (bucket_id = 'profile-gallery');

drop policy if exists "Authenticated users can upload profile gallery images" on storage.objects;
drop policy if exists "Users can upload their profile gallery images" on storage.objects;
create policy "Users can upload their profile gallery images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-gallery' and (
      ((storage.foldername(name))[1] = 'coach' and (storage.foldername(name))[2] = auth.uid()::text)
      or (
        (storage.foldername(name))[1] = 'org' and (
          public.is_admin(auth.uid())
          or exists (
            select 1 from public.organization_memberships membership
            where membership.org_id::text = (storage.foldername(name))[2]
              and membership.user_id::text = auth.uid()::text
              and membership.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
              and membership.status = 'active'
          )
        )
      )
    )
  );

drop policy if exists "Authenticated users can update profile gallery images" on storage.objects;
drop policy if exists "Users can update their profile gallery images" on storage.objects;
create policy "Users can update their profile gallery images"
  on storage.objects for update to authenticated
  using (bucket_id = 'profile-gallery' and owner_id::text = auth.uid()::text)
  with check (bucket_id = 'profile-gallery' and owner_id::text = auth.uid()::text);

drop policy if exists "Authenticated users can delete profile gallery images" on storage.objects;
drop policy if exists "Users can delete their profile gallery images" on storage.objects;
create policy "Users can delete their profile gallery images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-gallery' and (
      owner_id::text = auth.uid()::text
      or public.is_admin(auth.uid())
      or (
        (storage.foldername(name))[1] = 'org'
        and exists (
          select 1 from public.organization_memberships membership
          where membership.org_id::text = (storage.foldername(name))[2]
            and membership.user_id::text = auth.uid()::text
            and membership.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
            and membership.status = 'active'
        )
      )
    )
  );

-- Keep public organization and coach showcases concise and mobile-friendly.
create or replace function public.enforce_profile_gallery_six_photo_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner_key text;
  v_count integer;
begin
  v_owner_key := new.owner_type || ':' || coalesce(new.coach_id::text, new.org_id::text);
  perform pg_advisory_xact_lock(hashtextextended(v_owner_key, 0));

  -- Retrying an upload after a network timeout targets the same storage path
  -- and must not be treated as a seventh photo.
  if tg_op = 'INSERT' and exists (
    select 1 from public.profile_gallery_images existing
    where existing.storage_path = new.storage_path
  ) then
    return new;
  end if;

  select count(*) into v_count
  from public.profile_gallery_images image
  where image.owner_type = new.owner_type
    and image.id is distinct from new.id
    and (
      (new.owner_type = 'coach' and image.coach_id = new.coach_id)
      or (new.owner_type = 'org' and image.org_id = new.org_id)
    );

  if v_count >= 6 then
    raise exception 'Showcases can include up to 6 photos. Remove one before adding another.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_gallery_six_photo_limit_trigger
  on public.profile_gallery_images;
create trigger enforce_profile_gallery_six_photo_limit_trigger
before insert or update of owner_type, coach_id, org_id
on public.profile_gallery_images
for each row execute function public.enforce_profile_gallery_six_photo_limit();

create or replace function public.add_my_coach_showcase_image(
  p_image_url text,
  p_storage_path text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_image_url), '') is null then raise exception 'Image URL is required'; end if;
  if p_storage_path not like 'coach/' || auth.uid()::text || '/%' then
    raise exception 'Invalid showcase storage path';
  end if;
  insert into public.profile_gallery_images(id,owner_type,coach_id,org_id,image_url,storage_path)
  values(v_id,'coach',auth.uid(),null,p_image_url,p_storage_path)
  on conflict (storage_path) do update set image_url = excluded.image_url
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_my_coach_showcase_image(text,text) from public, anon;
grant execute on function public.add_my_coach_showcase_image(text,text) to authenticated;

notify pgrst, 'reload schema';

alter table public.profile_gallery_images
  add column if not exists original_filename text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint;

create or replace function public.add_my_coach_showcase_image(
  p_image_url text,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_image_url), '') is null then raise exception 'Image URL is required'; end if;
  if p_storage_path not like 'coach/' || auth.uid()::text || '/%' then
    raise exception 'Invalid showcase storage path';
  end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp','image/heic','image/heif') then
    raise exception 'Unsupported showcase image type';
  end if;
  if p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'Showcase images must be no larger than 10 MB';
  end if;
  insert into public.profile_gallery_images(
    id,owner_type,coach_id,org_id,image_url,storage_path,
    original_filename,mime_type,size_bytes
  ) values (
    v_id,'coach',auth.uid(),null,p_image_url,p_storage_path,
    left(nullif(btrim(p_original_filename), ''), 255),p_mime_type,p_size_bytes
  )
  on conflict (storage_path) do update set
    image_url = excluded.image_url,
    original_filename = excluded.original_filename,
    mime_type = excluded.mime_type,
    size_bytes = excluded.size_bytes
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_my_coach_showcase_image(text,text,text,text,bigint) from public, anon;
grant execute on function public.add_my_coach_showcase_image(text,text,text,text,bigint) to authenticated;

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
where id = 'profile-gallery';

notify pgrst, 'reload schema';
