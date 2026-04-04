create table if not exists public.athlete_payment_methods (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  cardholder_name text,
  card_brand text,
  card_last4 text,
  card_exp_month integer,
  card_exp_year integer,
  autopay_enabled boolean not null default true,
  autopay_day text default 'due_date',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.athlete_payment_methods
  add column if not exists autopay_enabled boolean not null default true;

alter table public.athlete_payment_methods
  add column if not exists autopay_day text default 'due_date';

create index if not exists athlete_payment_methods_athlete_idx
  on public.athlete_payment_methods(athlete_id);

alter table public.athlete_payment_methods enable row level security;

drop policy if exists "athlete payment methods read" on public.athlete_payment_methods;
create policy "athlete payment methods read" on public.athlete_payment_methods
  for select using (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete payment methods insert" on public.athlete_payment_methods;
create policy "athlete payment methods insert" on public.athlete_payment_methods
  for insert with check (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete payment methods update" on public.athlete_payment_methods;
create policy "athlete payment methods update" on public.athlete_payment_methods
  for update using (athlete_id = auth.uid() or public.is_admin())
  with check (athlete_id = auth.uid() or public.is_admin());

drop policy if exists "athlete payment methods delete" on public.athlete_payment_methods;
create policy "athlete payment methods delete" on public.athlete_payment_methods
  for delete using (athlete_id = auth.uid() or public.is_admin());
