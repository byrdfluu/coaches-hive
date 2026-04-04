create table if not exists org_report_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  enabled boolean not null default false,
  cadence text not null default 'weekly',
  day_of_week int,
  day_of_month int,
  time_of_day text,
  recipients text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

create index if not exists org_report_schedules_org_id_idx on org_report_schedules (org_id);

create or replace function set_org_report_schedules_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists org_report_schedules_set_updated_at on org_report_schedules;
create trigger org_report_schedules_set_updated_at
before update on org_report_schedules
for each row execute procedure set_org_report_schedules_updated_at();
