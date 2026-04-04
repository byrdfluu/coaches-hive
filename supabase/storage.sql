alter table public.profiles add column if not exists avatar_url text;

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  file_path text not null,
  file_url text not null,
  file_name text,
  file_type text,
  file_size integer,
  created_at timestamptz not null default now()
);

create index if not exists message_attachments_message_id_idx on public.message_attachments(message_id);
