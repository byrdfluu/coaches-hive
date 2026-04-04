create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_receipts_user_id_idx on public.message_receipts(user_id);
create index if not exists message_receipts_delivered_at_idx on public.message_receipts(delivered_at);
create index if not exists message_receipts_read_at_idx on public.message_receipts(read_at);
