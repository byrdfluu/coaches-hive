-- Extend the shared occurrence contract with location/coach metadata, duplicate
-- protection, audit history, and schedule-change notifications.
alter table public.org_offering_occurrences add column if not exists venue_id uuid references public.org_locations(id) on delete set null;
alter table public.org_offering_occurrences add column if not exists field_or_court text;
alter table public.org_offering_occurrences add column if not exists coach_ids uuid[] not null default '{}';
alter table public.org_offering_occurrences add column if not exists cancelled_at timestamptz;
create unique index if not exists org_offering_occurrences_exact_unique on public.org_offering_occurrences(org_id,offering_type,offering_id,starts_at,ends_at) where status<>'cancelled';
create index if not exists org_offering_occurrences_coaches_idx on public.org_offering_occurrences using gin(coach_ids);

create or replace function public.audit_org_offering_occurrence_change() returns trigger language plpgsql security definer set search_path=public as $$
declare v_action text;v_workspace uuid;
begin
 v_action:=case when tg_op='INSERT' then 'offering_occurrence_created' when new.status='cancelled' and old.status is distinct from new.status then 'offering_occurrence_cancelled' when new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then 'offering_occurrence_rescheduled' when new.status is distinct from old.status then 'offering_occurrence_status_changed' else 'offering_occurrence_updated' end;
 insert into public.org_audit_log(org_id,action,actor_id,target_type,target_id,metadata) values(new.org_id,v_action,auth.uid(),'org_offering_occurrence',new.id,jsonb_build_object('offering_id',new.offering_id,'starts_at',new.starts_at,'ends_at',new.ends_at,'status',new.status));
 if tg_op='UPDATE' and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.status is distinct from old.status) then
  select id into v_workspace from public.business_workspaces where organization_id=new.org_id and workspace_type='organization' and status='active' limit 1;
  insert into public.notifications(user_id,type,title,body,action_url,workspace_id,data,deduplication_key)
  select distinct r.owner_user_id,'offering_schedule_changed','Offering schedule updated',case when new.status='cancelled' then 'A registered offering date was cancelled.' else 'A registered offering date or time changed.' end,'/athlete/programs',v_workspace,jsonb_build_object('offering_id',new.offering_id,'occurrence_id',new.id,'status',new.status),'offering-occurrence-'||new.id||'-'||extract(epoch from now())::bigint
  from public.program_registrations r where r.occurrence_id=new.id and r.status not in('cancelled','refunded');
 end if;return new;
end $$;
drop trigger if exists audit_org_offering_occurrence_change on public.org_offering_occurrences;
create trigger audit_org_offering_occurrence_change after insert or update on public.org_offering_occurrences for each row execute function public.audit_org_offering_occurrence_change();
notify pgrst,'reload schema';
