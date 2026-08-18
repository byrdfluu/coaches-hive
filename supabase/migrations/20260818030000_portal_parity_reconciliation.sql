-- Additive reconciliation for capabilities already shipped by the iOS clients.
-- This migration is intentionally non-destructive and preserves all legacy data.

create table if not exists public.coach_training_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
  title text not null,
  description text,
  content text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_training_plan_progress (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.coach_training_plans(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, athlete_id)
);

create table if not exists public.session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'present', 'absent')),
  marked_by uuid references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, athlete_id)
);

create table if not exists public.org_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.org_compliance_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'complete', 'overdue', 'waived')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_notification_preferences (
  coach_id uuid primary key references public.profiles(id) on delete cascade,
  schedule_changes boolean not null default true,
  new_messages boolean not null default true,
  marketplace_orders boolean not null default true,
  waiver_updates boolean not null default true,
  attendance_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_notification_preferences (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  schedule_changes boolean not null default true,
  payment_reminders boolean not null default true,
  marketplace_updates boolean not null default true,
  waiver_reminders boolean not null default true,
  messages boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.org_notification_preferences (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  payment_reminders boolean not null default true,
  marketplace_orders boolean not null default true,
  roster_updates boolean not null default true,
  schedule_changes boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.org_notification_preferences add column if not exists payment_reminders boolean not null default true;
alter table public.org_notification_preferences add column if not exists marketplace_orders boolean not null default true;
alter table public.org_notification_preferences add column if not exists roster_updates boolean not null default true;
alter table public.org_notification_preferences add column if not exists schedule_changes boolean not null default true;

alter table public.coach_training_plans enable row level security;
alter table public.coach_training_plan_progress enable row level security;
alter table public.session_attendance enable row level security;
alter table public.org_contacts enable row level security;
alter table public.org_compliance_items enable row level security;
alter table public.coach_notification_preferences enable row level security;
alter table public.athlete_notification_preferences enable row level security;
alter table public.org_notification_preferences enable row level security;

create index if not exists coach_training_plans_coach_idx on public.coach_training_plans(coach_id, created_at desc);
create index if not exists coach_training_plans_athlete_idx on public.coach_training_plans(athlete_id);
create index if not exists coach_training_plan_progress_plan_idx on public.coach_training_plan_progress(plan_id);
create index if not exists session_attendance_session_idx on public.session_attendance(session_id);
create index if not exists org_contacts_org_idx on public.org_contacts(org_id);
create index if not exists org_compliance_items_org_idx on public.org_compliance_items(org_id, status);

drop policy if exists coach_training_plans_manage_coach on public.coach_training_plans;
create policy coach_training_plans_manage_coach on public.coach_training_plans for all
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
drop policy if exists coach_training_plans_athlete_view on public.coach_training_plans;
create policy coach_training_plans_athlete_view on public.coach_training_plans for select using (
  exists (select 1 from public.athlete_profiles ap where ap.id = coach_training_plans.athlete_id and ap.owner_user_id = auth.uid())
);

drop policy if exists athletes_manage_own_plan_progress on public.coach_training_plan_progress;
create policy athletes_manage_own_plan_progress on public.coach_training_plan_progress for all using (
  exists (select 1 from public.athlete_profiles ap where ap.id = coach_training_plan_progress.athlete_id and ap.owner_user_id = auth.uid())
) with check (
  exists (select 1 from public.athlete_profiles ap where ap.id = coach_training_plan_progress.athlete_id and ap.owner_user_id = auth.uid())
);
drop policy if exists coaches_read_plan_progress on public.coach_training_plan_progress;
create policy coaches_read_plan_progress on public.coach_training_plan_progress for select using (
  exists (select 1 from public.coach_training_plans p where p.id = coach_training_plan_progress.plan_id and p.coach_id = auth.uid())
);

drop policy if exists coaches_manage_session_attendance on public.session_attendance;
create policy coaches_manage_session_attendance on public.session_attendance for all using (
  exists (select 1 from public.sessions s where s.id = session_attendance.session_id and s.coach_id = auth.uid())
) with check (
  exists (select 1 from public.sessions s where s.id = session_attendance.session_id and s.coach_id = auth.uid())
);
drop policy if exists athletes_view_own_session_attendance on public.session_attendance;
create policy athletes_view_own_session_attendance on public.session_attendance for select
  using (athlete_id = auth.uid());

drop policy if exists org_contacts_manage_org on public.org_contacts;
create policy org_contacts_manage_org on public.org_contacts for all using (
  exists (select 1 from public.organization_memberships om where om.org_id = org_contacts.org_id and om.user_id = auth.uid())
) with check (
  exists (select 1 from public.organization_memberships om where om.org_id = org_contacts.org_id and om.user_id = auth.uid())
);
drop policy if exists org_compliance_manage_org on public.org_compliance_items;
create policy org_compliance_manage_org on public.org_compliance_items for all using (
  exists (select 1 from public.organization_memberships om where om.org_id = org_compliance_items.org_id and om.user_id = auth.uid())
) with check (
  exists (select 1 from public.organization_memberships om where om.org_id = org_compliance_items.org_id and om.user_id = auth.uid())
);

drop policy if exists coach_notification_preferences_self on public.coach_notification_preferences;
create policy coach_notification_preferences_self on public.coach_notification_preferences for all
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
drop policy if exists athlete_notification_preferences_self on public.athlete_notification_preferences;
create policy athlete_notification_preferences_self on public.athlete_notification_preferences for all
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
drop policy if exists org_notification_preferences_member on public.org_notification_preferences;
create policy org_notification_preferences_member on public.org_notification_preferences for all using (
  exists (select 1 from public.organization_memberships om where om.org_id = org_notification_preferences.org_id and om.user_id = auth.uid())
) with check (
  exists (select 1 from public.organization_memberships om where om.org_id = org_notification_preferences.org_id and om.user_id = auth.uid())
);
