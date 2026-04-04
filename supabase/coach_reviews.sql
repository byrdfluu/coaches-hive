-- Coach reviews (athlete feedback on coaches)

create table if not exists public.coach_reviews (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid references public.profiles(id) on delete set null,
  reviewer_name text,
  rating integer not null check (rating >= 1 and rating <= 5),
  body text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists coach_reviews_coach_idx on public.coach_reviews(coach_id);
create index if not exists coach_reviews_status_idx on public.coach_reviews(status);

alter table public.coach_reviews enable row level security;

alter table public.coach_reviews
  drop constraint if exists coach_reviews_status_check;

alter table public.coach_reviews
  add constraint coach_reviews_status_check
  check (status in ('pending','approved','rejected'));

drop policy if exists "coach reviews read approved" on public.coach_reviews;
create policy "coach reviews read approved" on public.coach_reviews
  for select using (
    status = 'approved'
  );

drop policy if exists "coach reviews insert" on public.coach_reviews;
create policy "coach reviews insert" on public.coach_reviews
  for insert with check (
    athlete_id = auth.uid()
  );
