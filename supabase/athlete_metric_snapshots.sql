-- Athlete metric snapshots: timestamped data points for progress tracking
-- Separate from athlete_metrics (current-value display) — this table powers trend charts

create table if not exists athlete_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid references profiles(id) on delete set null,
  metric_label text not null,
  value text not null,
  unit text,
  recorded_at date not null default current_date,
  source text default 'manual' check (source in ('manual', 'import', 'athlete_self')),
  notes text,
  created_at timestamptz default now()
);

create index if not exists athlete_metric_snapshots_athlete_label_date
  on athlete_metric_snapshots (athlete_id, metric_label, recorded_at desc);

create index if not exists athlete_metric_snapshots_coach_id
  on athlete_metric_snapshots (coach_id);

alter table athlete_metric_snapshots enable row level security;

-- Coach can read/write snapshots for their linked athletes
create policy "coach_rw_snapshots" on athlete_metric_snapshots
  for all using (
    coach_id = auth.uid()
    or exists (
      select 1 from coach_athlete_links
      where coach_id = auth.uid()
        and athlete_id = athlete_metric_snapshots.athlete_id
    )
  );

-- Athlete can read/write their own snapshots
create policy "athlete_rw_own_snapshots" on athlete_metric_snapshots
  for all using (athlete_id = auth.uid());
