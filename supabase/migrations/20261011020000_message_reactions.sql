create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','😢','👏')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_created_idx
  on public.message_reactions(message_id, created_at);
create index if not exists message_reactions_user_idx
  on public.message_reactions(user_id);

alter table public.message_reactions enable row level security;

drop policy if exists message_reactions_participant_read on public.message_reactions;
create policy message_reactions_participant_read on public.message_reactions
for select to authenticated using (
  exists (
    select 1 from public.messages m
    join public.thread_participants tp on tp.thread_id = m.thread_id
    where m.id = message_reactions.message_id and tp.user_id = auth.uid()
  )
);

drop policy if exists message_reactions_participant_create on public.message_reactions;
create policy message_reactions_participant_create on public.message_reactions
for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.messages m
    join public.thread_participants tp on tp.thread_id = m.thread_id
    where m.id = message_reactions.message_id
      and m.deleted_at is null
      and tp.user_id = auth.uid()
  )
);

drop policy if exists message_reactions_owner_delete on public.message_reactions;
create policy message_reactions_owner_delete on public.message_reactions
for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.message_reactions to authenticated;
