-- Selectable dates/times shared by organization programs, events, and tryouts.
create table if not exists public.org_offering_occurrences (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  offering_type text not null check (offering_type in ('program','camp','clinic','league','course','academy','workshop','event','tryout')),
  offering_id uuid not null, starts_at timestamptz not null, ends_at timestamptz not null,
  timezone text not null default 'America/New_York', location text, capacity integer check (capacity is null or capacity > 0),
  status text not null default 'published' check (status in ('draft','published','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (ends_at > starts_at)
);
create index if not exists org_offering_occurrences_lookup_idx on public.org_offering_occurrences(offering_type,offering_id,starts_at);
alter table public.program_registrations add column if not exists occurrence_id uuid references public.org_offering_occurrences(id) on delete set null;
alter table public.org_tryout_registrations add column if not exists occurrence_id uuid references public.org_offering_occurrences(id) on delete set null;
alter table public.org_offering_occurrences enable row level security;
drop policy if exists offering_occurrences_read on public.org_offering_occurrences;
create policy offering_occurrences_read on public.org_offering_occurrences for select to authenticated using(status='published' or public.is_org_member(org_id) or public.is_admin(auth.uid()));
drop policy if exists offering_occurrences_manage on public.org_offering_occurrences;
create policy offering_occurrences_manage on public.org_offering_occurrences for all to authenticated using(public.is_org_director(org_id) or public.is_admin(auth.uid())) with check(public.is_org_director(org_id) or public.is_admin(auth.uid()));

create or replace function public.select_family_offering_occurrence(p_registration_id uuid,p_offering_type text,p_occurrence_id uuid,p_athlete_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_occ public.org_offering_occurrences;v_count integer;
begin
 select * into v_occ from public.org_offering_occurrences where id=p_occurrence_id for update;
 if v_occ.id is null or v_occ.status<>'published' or v_occ.starts_at<=now() then raise exception 'This date and time is no longer available';end if;
 if v_occ.capacity is not null then
  if p_offering_type='tryout' then select count(*) into v_count from public.org_tryout_registrations where occurrence_id=v_occ.id and status not in('cancelled','refunded');
  else select count(*) into v_count from public.program_registrations where occurrence_id=v_occ.id and status not in('cancelled','refunded');end if;
  if v_count>=v_occ.capacity then raise exception 'This date and time is full';end if;
 end if;
 if p_offering_type='tryout' then update public.org_tryout_registrations set occurrence_id=v_occ.id where id=p_registration_id and athlete_profile_id=p_athlete_id and exists(select 1 from public.org_tryouts t where t.id=tryout_id and t.id=v_occ.offering_id);
 else update public.program_registrations set occurrence_id=v_occ.id where id=p_registration_id and athlete_profile_id=p_athlete_id and exists(select 1 from public.programs p where p.id=program_id and p.id=v_occ.offering_id);end if;
 if not found then raise exception 'Registration does not match this offering';end if;return v_occ.id;
end $$;
revoke all on function public.select_family_offering_occurrence(uuid,text,uuid,uuid) from public,anon;
grant execute on function public.select_family_offering_occurrence(uuid,text,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
