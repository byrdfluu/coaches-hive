-- Referral tracking tables

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create unique index if not exists referral_codes_code_idx on public.referral_codes(code);
create index if not exists referral_codes_user_idx on public.referral_codes(user_id);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referee_id uuid references public.profiles(id) on delete set null,
  code text,
  role text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists referrals_referrer_idx on public.referrals(referrer_id);
create index if not exists referrals_referee_idx on public.referrals(referee_id);
