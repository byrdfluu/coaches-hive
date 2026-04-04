-- Session payments + coach payouts

create table if not exists public.session_payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  amount numeric not null default 0,
  platform_fee numeric not null default 0,
  net_amount numeric not null default 0,
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  payment_method text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_payments_session_idx on public.session_payments(session_id);
create index if not exists session_payments_coach_idx on public.session_payments(coach_id);
create index if not exists session_payments_athlete_idx on public.session_payments(athlete_id);

create table if not exists public.coach_payouts (
  id uuid primary key default gen_random_uuid(),
  session_payment_id uuid not null references public.session_payments(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null default 0,
  status text not null default 'scheduled' check (status in ('scheduled','paid','failed')),
  scheduled_for timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_payouts_coach_idx on public.coach_payouts(coach_id);
create index if not exists coach_payouts_payment_idx on public.coach_payouts(session_payment_id);

alter table public.session_payments enable row level security;
alter table public.coach_payouts enable row level security;

drop policy if exists "session payments select" on public.session_payments;
create policy "session payments select" on public.session_payments
  for select using (
    athlete_id = auth.uid()
    or coach_id = auth.uid()
    or (auth.jwt() ->> 'role') = 'admin'
  );

drop policy if exists "session payments insert" on public.session_payments;
create policy "session payments insert" on public.session_payments
  for insert with check ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "session payments update" on public.session_payments;
create policy "session payments update" on public.session_payments
  for update using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach payouts select" on public.coach_payouts;
create policy "coach payouts select" on public.coach_payouts
  for select using (
    coach_id = auth.uid()
    or (auth.jwt() ->> 'role') = 'admin'
  );

drop policy if exists "coach payouts manage" on public.coach_payouts;
create policy "coach payouts manage" on public.coach_payouts
  for insert with check ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists "coach payouts update" on public.coach_payouts;
create policy "coach payouts update" on public.coach_payouts
  for update using ((auth.jwt() ->> 'role') = 'admin')
  with check ((auth.jwt() ->> 'role') = 'admin');
