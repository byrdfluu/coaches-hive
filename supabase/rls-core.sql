-- Enable RLS
alter table if exists public.profiles enable row level security;
alter table if exists public.sessions enable row level security;
alter table if exists public.availability_blocks enable row level security;
alter table if exists public.threads enable row level security;
alter table if exists public.thread_participants enable row level security;
alter table if exists public.messages enable row level security;
alter table if exists public.message_receipts enable row level security;
alter table if exists public.orders enable row level security;
alter table if exists public.products enable row level security;

-- Profiles
create policy if not exists "profiles_select_self" on public.profiles
  for select
  using (auth.uid() = id or (auth.jwt() ->> 'role') = 'admin');

create policy if not exists "profiles_select_org_staff" on public.profiles
  for select
  using (
    exists (
      select 1
      from public.organization_memberships viewer
      join public.organization_memberships member
        on member.org_id = viewer.org_id
      where viewer.user_id = auth.uid()
        and viewer.role in ('org_admin','school_admin','athletic_director','team_manager','coach','assistant_coach')
        and member.user_id = profiles.id
    )
  );

create policy if not exists "profiles_select_thread_participants" on public.profiles
  for select
  using (
    exists (
      select 1
      from public.thread_participants tp
      join public.thread_participants tp_self
        on tp.thread_id = tp_self.thread_id
      where tp.user_id = profiles.id
        and tp_self.user_id = auth.uid()
    )
  );

create policy if not exists "profiles_insert_self" on public.profiles
  for insert
  with check (auth.uid() = id);

create policy if not exists "profiles_update_self" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Sessions (bookings)
create policy if not exists "sessions_select_participants" on public.sessions
  for select
  using (coach_id = auth.uid() or athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

create policy if not exists "sessions_insert_participants" on public.sessions
  for insert
  with check (coach_id = auth.uid() or athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

create policy if not exists "sessions_update_participants" on public.sessions
  for update
  using (coach_id = auth.uid() or athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

-- Availability
create policy if not exists "availability_select_all_auth" on public.availability_blocks
  for select
  using (auth.uid() is not null);

create policy if not exists "availability_write_coach" on public.availability_blocks
  for all
  using (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin')
  with check (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

-- Threads
create policy if not exists "threads_select_participant" on public.threads
  for select
  using (exists (
    select 1 from public.thread_participants tp
    where tp.thread_id = threads.id and tp.user_id = auth.uid()
  ) or (auth.jwt() ->> 'role') = 'admin');

create policy if not exists "threads_insert_creator" on public.threads
  for insert
  with check (created_by = auth.uid());

-- Thread participants
create policy if not exists "participants_select_self" on public.thread_participants
  for select
  using (
    (auth.jwt() ->> 'role') = 'admin'
    or user_id = auth.uid()
    or exists (
      select 1 from public.thread_participants tp
      where tp.thread_id = thread_participants.thread_id
        and tp.user_id = auth.uid()
    )
  );

create policy if not exists "participants_insert_self" on public.thread_participants
  for insert
  with check (user_id = auth.uid());

-- Messages
create policy if not exists "messages_select_participant" on public.messages
  for select
  using (exists (
    select 1 from public.thread_participants tp
    where tp.thread_id = messages.thread_id and tp.user_id = auth.uid()
  ) or (auth.jwt() ->> 'role') = 'admin');

create policy if not exists "messages_insert_sender" on public.messages
  for insert
  with check (sender_id = auth.uid());

create policy if not exists "messages_update_sender" on public.messages
  for update
  using (sender_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

-- Message receipts
create policy if not exists "receipts_select_self" on public.message_receipts
  for select
  using (user_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

create policy if not exists "receipts_insert_self" on public.message_receipts
  for insert
  with check (user_id = auth.uid());

create policy if not exists "receipts_update_self" on public.message_receipts
  for update
  using (user_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

-- Orders
create policy if not exists "orders_select_participant" on public.orders
  for select
  using (athlete_id = auth.uid() or coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

create policy if not exists "orders_insert_athlete" on public.orders
  for insert
  with check (athlete_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

create policy if not exists "orders_update_owner" on public.orders
  for update
  using (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

-- Products
create policy if not exists "products_select_public_or_owner" on public.products
  for select
  using (status = 'published' or coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

create policy if not exists "products_insert_owner" on public.products
  for insert
  with check (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

create policy if not exists "products_update_owner" on public.products
  for update
  using (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

create policy if not exists "products_delete_owner" on public.products
  for delete
  using (coach_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');
