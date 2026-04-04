create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payer_id uuid references public.profiles(id) on delete set null,
  payee_id uuid references public.profiles(id) on delete set null,
  org_id uuid references public.organizations(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  session_payment_id uuid references public.session_payments(id) on delete set null,
  fee_assignment_id uuid references public.org_fee_assignments(id) on delete set null,
  amount numeric not null,
  currency text not null default 'usd',
  status text not null default 'paid',
  receipt_url text,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  refund_amount numeric,
  refunded_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_receipts_payer_idx on public.payment_receipts(payer_id);
create index if not exists payment_receipts_payee_idx on public.payment_receipts(payee_id);
create index if not exists payment_receipts_org_idx on public.payment_receipts(org_id);
create index if not exists payment_receipts_order_idx on public.payment_receipts(order_id);
create index if not exists payment_receipts_session_idx on public.payment_receipts(session_payment_id);
create index if not exists payment_receipts_fee_idx on public.payment_receipts(fee_assignment_id);

alter table public.payment_receipts enable row level security;

drop policy if exists "payment receipts select" on public.payment_receipts;
create policy "payment receipts select" on public.payment_receipts
  for select using (
    public.is_admin()
    or payer_id = auth.uid()
    or payee_id = auth.uid()
    or exists (
      select 1
      from public.organization_memberships m
      where m.org_id = payment_receipts.org_id
        and m.user_id = auth.uid()
        and m.role in ('org_admin', 'school_admin', 'athletic_director')
    )
  );

drop policy if exists "payment receipts insert" on public.payment_receipts;
create policy "payment receipts insert" on public.payment_receipts
  for insert with check (public.is_admin());

drop policy if exists "payment receipts update" on public.payment_receipts;
create policy "payment receipts update" on public.payment_receipts
  for update using (public.is_admin())
  with check (public.is_admin());
