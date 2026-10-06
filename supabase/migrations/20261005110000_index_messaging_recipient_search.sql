begin;

create extension if not exists pg_trgm with schema extensions;

create index if not exists profiles_full_name_messaging_trgm_idx
  on public.profiles using gin (full_name extensions.gin_trgm_ops)
  where coalesce(is_test,false)=false and coalesce(status,'active')='active';

create index if not exists athlete_profiles_full_name_messaging_trgm_idx
  on public.athlete_profiles using gin (full_name extensions.gin_trgm_ops)
  where coalesce(is_test,false)=false and status='active';

create index if not exists athlete_profiles_auth_user_messaging_idx
  on public.athlete_profiles(auth_user_id)
  where auth_user_id is not null and coalesce(is_test,false)=false and status='active';

commit;
