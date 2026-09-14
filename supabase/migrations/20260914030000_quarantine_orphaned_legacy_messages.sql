-- Quarantine legacy messages whose threads have no participants. They remain
-- inaccessible, but receive the sender's one active workspace for complete
-- ownership attribution and reconciliation accounting.

update public.messages m set workspace_id=p.workspace_id
from public.active_workspace_preferences p
where m.workspace_id is null
  and p.user_id=m.sender_id
  and not exists (
    select 1 from public.thread_participants tp where tp.thread_id=m.thread_id
  );

insert into public.workspace_audit_events(
  workspace_id,actor_user_id,acting_role,event_type,record_type,record_id,metadata
)
select distinct m.workspace_id,m.sender_id,'system','legacy_message_quarantined','thread',m.thread_id,
  jsonb_build_object('reason','thread_has_no_participants','access_preserved',false)
from public.messages m
where m.workspace_id is not null
  and not exists (select 1 from public.thread_participants tp where tp.thread_id=m.thread_id)
  and not exists (
    select 1 from public.workspace_audit_events e
    where e.event_type='legacy_message_quarantined' and e.record_id=m.thread_id
  );
