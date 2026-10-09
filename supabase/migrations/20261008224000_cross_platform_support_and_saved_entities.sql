-- Consolidate mobile and web support history onto support_messages and keep
-- contextual saved entities reproducible from the maintained web repository.

create table if not exists public.athlete_saved_programs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete_profiles(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (athlete_id, program_id)
);

alter table public.athlete_saved_programs enable row level security;
drop policy if exists athlete_manage_own_saved_programs on public.athlete_saved_programs;
create policy athlete_manage_own_saved_programs on public.athlete_saved_programs
for all using (public.owns_athlete_profile(athlete_id))
with check (public.owns_athlete_profile(athlete_id));
create index if not exists athlete_saved_programs_athlete_idx
  on public.athlete_saved_programs(athlete_id);

-- Older native releases created tickets with user_id and wrote replies to
-- support_ticket_messages. Populate the requester identity used by the shared
-- API, then copy each legacy reply once into the canonical thread.
update public.support_tickets as ticket
set
  requester_email = coalesce(ticket.requester_email, profile.email),
  requester_name = coalesce(ticket.requester_name, profile.full_name, profile.email),
  requester_role = coalesce(ticket.requester_role, profile.role, 'member'),
  metadata = coalesce(ticket.metadata, '{}'::jsonb)
    || jsonb_build_object('requester_id', coalesce(ticket.metadata ->> 'requester_id', ticket.user_id::text))
from public.profiles as profile
where ticket.user_id = profile.id
  and (
    ticket.requester_email is null
    or ticket.requester_name is null
    or ticket.requester_role is null
    or coalesce(ticket.metadata ->> 'requester_id', '') = ''
  );

insert into public.support_messages (
  ticket_id,
  sender_role,
  sender_name,
  sender_id,
  body,
  is_internal,
  metadata,
  created_at,
  customer_read_at,
  staff_read_at
)
select
  legacy.ticket_id,
  case when legacy.is_staff then 'admin' else coalesce(profile.role, 'member') end,
  coalesce(profile.full_name, profile.email, case when legacy.is_staff then 'Support' else 'User' end),
  legacy.sender_id,
  legacy.body,
  false,
  jsonb_build_object('legacy_support_ticket_message_id', legacy.id),
  legacy.created_at,
  case when not legacy.is_staff then coalesce(legacy.read_at, legacy.created_at) else legacy.read_at end,
  case when legacy.is_staff then coalesce(legacy.read_at, legacy.created_at) else legacy.read_at end
from public.support_ticket_messages as legacy
left join public.profiles as profile on profile.id = legacy.sender_id
where not exists (
  select 1
  from public.support_messages as canonical
  where canonical.metadata ->> 'legacy_support_ticket_message_id' = legacy.id::text
);
