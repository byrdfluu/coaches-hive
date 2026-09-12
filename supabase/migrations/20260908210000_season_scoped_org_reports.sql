-- Connect saved and scheduled organization reports to the canonical season
-- records managed from Settings > Seasons. NULL intentionally means all seasons.

alter table public.org_saved_reports
  add column if not exists season_id uuid references public.org_seasons(id) on delete set null;

alter table public.org_report_schedules
  add column if not exists season_id uuid references public.org_seasons(id) on delete set null;

create index if not exists org_saved_reports_season_idx
  on public.org_saved_reports(org_id, season_id, created_at desc);

create index if not exists org_report_schedules_season_idx
  on public.org_report_schedules(org_id, season_id, is_active);

-- A report may only reference a season owned by the same organization.
create or replace function public.validate_org_report_season()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.season_id is not null and not exists (
    select 1 from public.org_seasons s
    where s.id = new.season_id and s.org_id = new.org_id
  ) then
    raise exception 'Report season must belong to the report organization';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_org_saved_report_season on public.org_saved_reports;
create trigger validate_org_saved_report_season
before insert or update of org_id, season_id on public.org_saved_reports
for each row execute function public.validate_org_report_season();

drop trigger if exists validate_org_report_schedule_season on public.org_report_schedules;
create trigger validate_org_report_schedule_season
before insert or update of org_id, season_id on public.org_report_schedules
for each row execute function public.validate_org_report_season();
