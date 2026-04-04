alter table public.sessions
  add column if not exists practice_plan_id uuid references public.practice_plans(id) on delete set null;

create index if not exists sessions_practice_plan_idx on public.sessions(practice_plan_id);
