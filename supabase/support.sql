create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  status text not null default 'open',
  priority text not null default 'medium',
  channel text not null default 'in_app',
  requester_name text,
  requester_email text,
  requester_role text,
  org_name text,
  team_name text,
  assigned_to uuid,
  external_message_id text,
  external_thread_id text,
  last_message_preview text,
  last_message_at timestamptz,
  sla_minutes integer,
  sla_due_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.support_tickets(id) on delete cascade,
  sender_role text not null,
  sender_name text,
  sender_id uuid,
  body text not null,
  is_internal boolean default false,
  metadata jsonb default '{}'::jsonb,
  attachments jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create index if not exists support_tickets_status_idx on public.support_tickets(status);
create index if not exists support_tickets_channel_idx on public.support_tickets(channel);
create index if not exists support_tickets_external_message_idx on public.support_tickets(external_message_id);
create index if not exists support_tickets_sla_due_idx on public.support_tickets(sla_due_at);
create index if not exists support_messages_ticket_idx on public.support_messages(ticket_id);
