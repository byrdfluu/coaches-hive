-- Durable audit and rate-limit records for administrator-initiated account
-- recovery. No password, recovery token, or service credential is stored.
create table if not exists public.staff_invite_provision_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  workspace_id uuid not null references public.business_workspaces(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invitation_id uuid references public.org_invites(id) on delete set null,
  normalized_email_hash text not null,
  status text not null check(status in ('started','sent','failed','rate_limited')),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists staff_invite_provision_rate_idx
  on public.staff_invite_provision_requests(actor_user_id,normalized_email_hash,created_at desc);

alter table public.staff_invite_provision_requests enable row level security;
revoke all on public.staff_invite_provision_requests from anon,authenticated;

alter table public.org_invites drop constraint if exists org_invites_status_check;
alter table public.org_invites add constraint org_invites_status_check check(status in (
  'draft','pending','failed','awaiting_approval','accepted','approved','declined','canceled','expired'
));

-- Program directors use the coach-style base profile while workspace roles
-- remain the authoritative multi-role access list.
create or replace function public.apply_staff_invite_profile_role()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_user_id uuid;
begin
  if new.status not in ('accepted','approved') then return new; end if;
  v_user_id := coalesce(new.accepted_by,new.invited_user_id);
  if v_user_id is null then return new; end if;
  if 'program_director'=any(coalesce(new.roles,array[new.role]::text[])) then
    update public.profiles set role='coach',updated_at=now() where id=v_user_id;
  end if;
  return new;
end $$;

drop trigger if exists apply_staff_invite_profile_role_trigger on public.org_invites;
create trigger apply_staff_invite_profile_role_trigger
after insert or update of status,accepted_by,invited_user_id on public.org_invites
for each row execute function public.apply_staff_invite_profile_role();
