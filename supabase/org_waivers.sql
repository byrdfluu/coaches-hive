-- org_waivers: waiver templates created by org admins
create table if not exists org_waivers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  body text not null,
  required_roles text[] not null default array['athlete'],
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_waivers_org_id_idx on org_waivers(org_id);
create index if not exists org_waivers_active_idx on org_waivers(org_id, is_active);

-- waiver_signatures: records of athletes/guardians signing a waiver
create table if not exists waiver_signatures (
  id uuid primary key default gen_random_uuid(),
  waiver_id uuid not null references org_waivers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  ip_address text,
  signed_at timestamptz not null default now(),
  unique (waiver_id, user_id)
);

create index if not exists waiver_signatures_waiver_id_idx on waiver_signatures(waiver_id);
create index if not exists waiver_signatures_user_id_idx on waiver_signatures(user_id);

-- RLS
alter table org_waivers enable row level security;
alter table waiver_signatures enable row level security;

-- Org admins can read/write waivers for their org
create policy "org_admin_waivers_select" on org_waivers
  for select using (
    exists (
      select 1 from organization_memberships
      where organization_memberships.org_id = org_waivers.org_id
        and organization_memberships.user_id = auth.uid()
        and organization_memberships.role in ('admin', 'owner')
    )
  );

create policy "org_admin_waivers_insert" on org_waivers
  for insert with check (
    exists (
      select 1 from organization_memberships
      where organization_memberships.org_id = org_waivers.org_id
        and organization_memberships.user_id = auth.uid()
        and organization_memberships.role in ('admin', 'owner')
    )
  );

create policy "org_admin_waivers_update" on org_waivers
  for update using (
    exists (
      select 1 from organization_memberships
      where organization_memberships.org_id = org_waivers.org_id
        and organization_memberships.user_id = auth.uid()
        and organization_memberships.role in ('admin', 'owner')
    )
  );

-- Members can read active waivers for their org
create policy "org_member_waivers_select" on org_waivers
  for select using (
    is_active = true
    and exists (
      select 1 from organization_memberships
      where organization_memberships.org_id = org_waivers.org_id
        and organization_memberships.user_id = auth.uid()
    )
  );

-- Users can read their own signatures
create policy "waiver_signatures_own_select" on waiver_signatures
  for select using (user_id = auth.uid());

-- Users can insert their own signature
create policy "waiver_signatures_own_insert" on waiver_signatures
  for insert with check (user_id = auth.uid());

-- Org admins can read all signatures for their org's waivers
create policy "org_admin_signatures_select" on waiver_signatures
  for select using (
    exists (
      select 1 from org_waivers
      join organization_memberships on organization_memberships.org_id = org_waivers.org_id
      where org_waivers.id = waiver_signatures.waiver_id
        and organization_memberships.user_id = auth.uid()
        and organization_memberships.role in ('admin', 'owner')
    )
  );
