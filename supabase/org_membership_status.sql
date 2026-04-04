alter table public.organization_memberships
  add column if not exists status text not null default 'active';

alter table public.organization_memberships
  add column if not exists suspended_at timestamptz;

alter table public.organization_memberships
  drop constraint if exists organization_memberships_status_check;

alter table public.organization_memberships
  add constraint organization_memberships_status_check
  check (status in ('active', 'suspended'));
