-- iOS has always written coach waiver files to `coach-waivers`; older web
-- uploads used `attachments`. Record the bucket so both clients can read
-- legacy files while all new uploads converge on the private canonical bucket.

alter table public.coach_waivers
  add column if not exists storage_bucket text;

-- The first web waiver implementation called the durable object path
-- `file_path`; the native paperwork lifecycle calls it `storage_path`.
-- Keep both compatibility columns synchronized so writes from either client
-- are immediately readable by the other and proof snapshots always contain
-- the uploaded object path.
create or replace function public.sync_coach_waiver_file_path()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.storage_path := coalesce(new.storage_path, new.file_path);
    new.file_path := coalesce(new.storage_path, new.file_path);
  elsif new.storage_path is distinct from old.storage_path then
    new.file_path := new.storage_path;
  elsif new.file_path is distinct from old.file_path then
    new.storage_path := new.file_path;
  end if;
  return new;
end $$;

drop trigger if exists sync_coach_waiver_file_path_trigger on public.coach_waivers;
create trigger sync_coach_waiver_file_path_trigger
before insert or update of storage_path, file_path on public.coach_waivers
for each row execute function public.sync_coach_waiver_file_path();

update public.coach_waivers
set storage_path=coalesce(storage_path,file_path),
    file_path=coalesce(storage_path,file_path)
where storage_path is distinct from file_path;

update public.coach_waivers waiver
set storage_bucket = case
  when exists (
    select 1 from storage.objects object
    where object.bucket_id='coach-waivers' and object.name=coalesce(waiver.storage_path,waiver.file_path)
  ) then 'coach-waivers'
  else 'attachments'
end
where coalesce(waiver.storage_path,waiver.file_path) is not null
  and waiver.storage_bucket is null;

update public.coach_waivers
set storage_bucket='coach-waivers'
where storage_bucket is null;

alter table public.coach_waivers
  alter column storage_bucket set default 'coach-waivers',
  alter column storage_bucket set not null,
  drop constraint if exists coach_waivers_storage_bucket_check,
  add constraint coach_waivers_storage_bucket_check
    check (storage_bucket in ('coach-waivers','attachments'));

notify pgrst, 'reload schema';
