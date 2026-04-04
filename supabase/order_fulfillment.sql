-- Order fulfillment + refund tracking

alter table if exists public.orders
  add column if not exists fulfillment_status text default 'unfulfilled',
  add column if not exists fulfillment_notes text,
  add column if not exists tracking_number text,
  add column if not exists delivered_at timestamptz,
  add column if not exists refund_status text,
  add column if not exists refund_amount numeric,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reason text,
  add column if not exists refund_requested_at timestamptz;

create table if not exists public.order_refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  status text not null default 'requested' check (status in ('requested','approved','denied')),
  resolved_at timestamptz,
  resolver_id uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_refund_requests_order_idx on public.order_refund_requests(order_id);
create index if not exists order_refund_requests_requester_idx on public.order_refund_requests(requester_id);

alter table public.order_refund_requests enable row level security;

drop policy if exists "refund requests select" on public.order_refund_requests;
create policy "refund requests select" on public.order_refund_requests
  for select using (
    requester_id = auth.uid()
    or (auth.jwt() ->> 'role') = 'admin'
    or exists (
      select 1
      from public.orders o
      join public.organization_memberships m on m.org_id = o.org_id
      where o.id = order_refund_requests.order_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
    or exists (
      select 1 from public.orders o
      where o.id = order_refund_requests.order_id
        and o.coach_id = auth.uid()
    )
  );

drop policy if exists "refund requests insert" on public.order_refund_requests;
create policy "refund requests insert" on public.order_refund_requests
  for insert with check (requester_id = auth.uid() or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists "refund requests update" on public.order_refund_requests;
create policy "refund requests update" on public.order_refund_requests
  for update using (
    (auth.jwt() ->> 'role') = 'admin'
    or exists (
      select 1
      from public.orders o
      join public.organization_memberships m on m.org_id = o.org_id
      where o.id = order_refund_requests.order_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  )
  with check (
    (auth.jwt() ->> 'role') = 'admin'
    or exists (
      select 1
      from public.orders o
      join public.organization_memberships m on m.org_id = o.org_id
      where o.id = order_refund_requests.order_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin','school_admin','athletic_director','team_manager')
    )
  );
