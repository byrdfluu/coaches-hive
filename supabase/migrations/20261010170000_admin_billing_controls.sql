begin;

create table if not exists public.admin_subscription_access_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('active', 'revoked')),
  reason text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_subscription_access_overrides_user_active_idx
  on public.admin_subscription_access_overrides(user_id, status, ends_at);
alter table public.admin_subscription_access_overrides enable row level security;

create table if not exists public.organization_fee_exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  fee_percent numeric(7,4) not null check (fee_percent >= 0 and fee_percent <= 100),
  reason text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists organization_fee_exceptions_active_idx
  on public.organization_fee_exceptions(org_id, active, starts_at, ends_at);
alter table public.organization_fee_exceptions enable row level security;

commit;
