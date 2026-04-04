create table if not exists public.order_disputes (
  id uuid primary key default gen_random_uuid(),
  dispute_id text not null unique,
  order_id uuid references public.orders(id) on delete set null,
  fee_assignment_id uuid references public.org_fee_assignments(id) on delete set null,
  payment_intent_id text,
  charge_id text,
  amount numeric,
  currency text,
  reason text,
  status text,
  evidence_due_by timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_disputes_order_idx on public.order_disputes(order_id);
create index if not exists order_disputes_fee_idx on public.order_disputes(fee_assignment_id);
create index if not exists order_disputes_payment_idx on public.order_disputes(payment_intent_id);

alter table public.order_disputes enable row level security;

drop policy if exists "order disputes select" on public.order_disputes;
create policy "order disputes select" on public.order_disputes
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.orders o
      where o.id = order_disputes.order_id
        and (o.coach_id = auth.uid() or o.athlete_id = auth.uid())
    )
    or exists (
      select 1
      from public.org_fee_assignments a
      where a.id = order_disputes.fee_assignment_id
        and a.athlete_id = auth.uid()
    )
    or exists (
      select 1
      from public.organization_memberships m
      where m.org_id = (
        select o.org_id from public.orders o where o.id = order_disputes.order_id
      )
      and m.user_id = auth.uid()
    )
  );

drop policy if exists "order disputes insert" on public.order_disputes;
create policy "order disputes insert" on public.order_disputes
  for insert with check (public.is_admin());

drop policy if exists "order disputes update" on public.order_disputes;
create policy "order disputes update" on public.order_disputes
  for update using (public.is_admin())
  with check (public.is_admin());
