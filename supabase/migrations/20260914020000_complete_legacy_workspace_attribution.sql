-- Deterministic attribution for legacy rows created before workspace authority.
-- Ambiguous rows remain in the reconciliation queue; they are never guessed.

update public.org_fee_assignments r set workspace_id=w.id
from public.business_workspaces w
where r.workspace_id is null and w.workspace_type='organization' and w.organization_id=r.org_id;

update public.programs r set workspace_id=w.id
from public.business_workspaces w
where r.workspace_id is null and w.workspace_type='organization' and w.organization_id=r.org_id;

update public.program_registrations r set workspace_id=p.workspace_id
from public.programs p where r.workspace_id is null and p.id=r.program_id and p.workspace_id is not null;

update public.sessions r set workspace_id=w.id
from public.business_workspaces w
where r.workspace_id is null and r.org_id is not null and w.workspace_type='organization' and w.organization_id=r.org_id;
update public.sessions r set workspace_id=w.id
from public.business_workspaces w
where r.workspace_id is null and r.org_id is null and w.workspace_type='independent_coach' and w.owner_user_id=r.coach_id;

update public.coach_waivers r set workspace_id=w.id
from public.business_workspaces w
where r.workspace_id is null and w.workspace_type='independent_coach' and w.owner_user_id=r.coach_id;

update public.coach_fee_assignments r set workspace_id=s.workspace_id
from public.sessions s where r.workspace_id is null and r.session_id=s.id and s.workspace_id is not null;
update public.coach_fee_assignments r set workspace_id=w.id
from public.business_workspaces w
where r.workspace_id is null and w.workspace_type='independent_coach' and w.owner_user_id=r.coach_id;

-- A coach/athlete row may be attributed to an organization only when exactly
-- one active organization workspace contains both parties.
with candidates as (
  select n.id,(array_agg(distinct w.id))[1] workspace_id,count(distinct w.id) candidate_count
  from public.coach_notes n
  join public.workspace_athlete_relationships ar on ar.athlete_id=n.athlete_id and ar.status='active'
  join public.business_workspaces w on w.id=ar.workspace_id and w.workspace_type='organization' and w.status<>'archived'
  join public.workspace_memberships wm on wm.workspace_id=w.id and wm.user_id=n.coach_id and wm.status='active'
    and wm.roles && array['coach','assistant_coach','owner']::text[]
  where n.workspace_id is null group by n.id
)
update public.coach_notes n set workspace_id=c.workspace_id from candidates c
where n.id=c.id and c.candidate_count=1;
update public.coach_notes n set workspace_id=w.id
from public.business_workspaces w
where n.workspace_id is null and w.workspace_type='independent_coach' and w.owner_user_id=n.coach_id;

update public.messages m set workspace_id=w.id
from public.threads t join public.business_workspaces w
  on w.workspace_type='organization' and w.organization_id=t.org_id
where m.workspace_id is null and m.thread_id=t.id and t.org_id is not null;

with independent_thread as (
  select tp.thread_id,(array_agg(distinct w.id))[1] workspace_id,count(distinct w.id) candidate_count
  from public.thread_participants tp
  join public.business_workspaces w on w.workspace_type='independent_coach' and w.owner_user_id=tp.user_id and w.status<>'archived'
  join public.threads t on t.id=tp.thread_id and t.org_id is null
  group by tp.thread_id
)
update public.messages m set workspace_id=i.workspace_id from independent_thread i
where m.workspace_id is null and m.thread_id=i.thread_id and i.candidate_count=1;

create or replace function public.assign_message_workspace()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.workspace_id is not null then return new; end if;
  select w.id into new.workspace_id from public.threads t
  join public.business_workspaces w on w.workspace_type='organization' and w.organization_id=t.org_id
  where t.id=new.thread_id;
  if new.workspace_id is null then new.workspace_id:=public.current_active_workspace_id(new.sender_id); end if;
  return new;
end $$;
drop trigger if exists assign_message_workspace_trigger on public.messages;
create trigger assign_message_workspace_trigger before insert on public.messages
for each row execute function public.assign_message_workspace();

create or replace view public.workspace_reconciliation_queue as
select 'sessions'::text table_name,id,created_at from public.sessions where workspace_id is null
union all select 'coach_notes',id,created_at from public.coach_notes where workspace_id is null
union all select 'coach_waivers',id,created_at from public.coach_waivers where workspace_id is null
union all select 'org_documents',id,created_at from public.org_documents where workspace_id is null
union all select 'marketplace_items',id,created_at from public.marketplace_items where workspace_id is null
union all select 'marketplace_orders',id,created_at from public.marketplace_orders where workspace_id is null
union all select 'coach_fee_assignments',id,created_at from public.coach_fee_assignments where workspace_id is null
union all select 'org_fee_assignments',id,created_at from public.org_fee_assignments where workspace_id is null
union all select 'programs',id,created_at from public.programs where workspace_id is null
union all select 'program_registrations',id,created_at from public.program_registrations where workspace_id is null
union all select 'messages',id,created_at from public.messages where workspace_id is null;
revoke all on public.workspace_reconciliation_queue from public,anon,authenticated;
grant select on public.workspace_reconciliation_queue to service_role;
