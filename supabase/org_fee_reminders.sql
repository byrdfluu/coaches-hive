-- Org fee reminders + automation settings

alter table public.org_settings
  add column if not exists fee_reminder_policy text default 'off';

create table if not exists public.org_fee_reminders (
  id uuid primary key default gen_random_uuid(),
  fee_id uuid not null references public.org_fees(id) on delete cascade,
  assignment_id uuid references public.org_fee_assignments(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  reminder_type text not null default 'manual',
  message text,
  created_at timestamptz not null default now()
);

alter table public.org_fee_reminders
  drop constraint if exists org_fee_reminders_type_check;

alter table public.org_fee_reminders
  add constraint org_fee_reminders_type_check
  check (reminder_type in ('manual','scheduled'));

alter table public.org_fee_reminders enable row level security;

drop policy if exists "org fee reminders read" on public.org_fee_reminders;
create policy "org fee reminders read" on public.org_fee_reminders
  for select using (
    exists (
      select 1
      from public.org_fees f
      join public.organization_memberships m on m.org_id = f.org_id
      where f.id = org_fee_reminders.fee_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "org fee reminders manage" on public.org_fee_reminders;
create policy "org fee reminders manage" on public.org_fee_reminders
  for insert with check (
    exists (
      select 1
      from public.org_fees f
      join public.organization_memberships m on m.org_id = f.org_id
      where f.id = org_fee_reminders.fee_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  );
