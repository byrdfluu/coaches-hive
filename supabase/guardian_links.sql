create table if not exists public.guardian_athlete_links (
  id uuid primary key default gen_random_uuid(),
  guardian_user_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  relationship text not null default 'parent',
  status text not null default 'active' check (status in ('pending', 'active', 'revoked')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guardian_user_id, athlete_id)
);

create index if not exists guardian_athlete_links_guardian_idx on public.guardian_athlete_links(guardian_user_id);
create index if not exists guardian_athlete_links_athlete_idx on public.guardian_athlete_links(athlete_id);
create index if not exists guardian_athlete_links_status_idx on public.guardian_athlete_links(status);

alter table public.guardian_athlete_links enable row level security;

drop policy if exists "guardian_links select" on public.guardian_athlete_links;
create policy "guardian_links select" on public.guardian_athlete_links
  for select
  using (
    public.is_admin()
    or guardian_user_id = auth.uid()
    or athlete_id = auth.uid()
  );

drop policy if exists "guardian_links insert" on public.guardian_athlete_links;
create policy "guardian_links insert" on public.guardian_athlete_links
  for insert
  with check (
    public.is_admin()
    or guardian_user_id = auth.uid()
    or athlete_id = auth.uid()
  );

drop policy if exists "guardian_links update" on public.guardian_athlete_links;
create policy "guardian_links update" on public.guardian_athlete_links
  for update
  using (
    public.is_admin()
    or guardian_user_id = auth.uid()
    or athlete_id = auth.uid()
  )
  with check (
    public.is_admin()
    or guardian_user_id = auth.uid()
    or athlete_id = auth.uid()
  );

create or replace function public.sync_guardian_links_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  guardian_profile_id uuid;
begin
  if new.role <> 'athlete' then
    return new;
  end if;

  if coalesce(btrim(new.guardian_email), '') = '' then
    return new;
  end if;

  select p.id
  into guardian_profile_id
  from public.profiles p
  where lower(coalesce(p.email, '')) = lower(new.guardian_email)
    and p.id <> new.id
  order by p.created_at asc nulls last
  limit 1;

  if guardian_profile_id is null then
    return new;
  end if;

  insert into public.guardian_athlete_links (
    guardian_user_id,
    athlete_id,
    relationship,
    status,
    created_by,
    updated_at
  )
  values (
    guardian_profile_id,
    new.id,
    'parent',
    'active',
    new.id,
    now()
  )
  on conflict (guardian_user_id, athlete_id)
  do update set
    relationship = excluded.relationship,
    status = 'active',
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trigger_sync_guardian_links_from_profile on public.profiles;
create trigger trigger_sync_guardian_links_from_profile
after insert or update of guardian_email, role
on public.profiles
for each row
execute function public.sync_guardian_links_from_profile();
