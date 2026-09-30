-- User-facing invite notifications identify the participant when authorized
-- organization staff receive the event. Push delivery reads this same row.
create or replace function public.notify_org_managers_of_invite_acceptance()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text;
begin
  select nullif(trim(p.full_name),'') into v_name from public.profiles p where p.id=new.accepted_by;
  v_name:=coalesce(v_name,nullif(trim(new.invited_email),''),'A user');
  insert into public.notifications(user_id,title,body,type,related_id,category,deduplication_key,data)
  select distinct om.user_id,'Invite accepted',v_name||' accepted your organization invite.',
    'invite_accepted',new.id,'invites','invite_accepted:'||new.id::text||':'||om.user_id::text,
    jsonb_build_object('org_id',new.org_id,'organization_id',new.org_id,'org_preference','new_invite_accepted',
      'invite_id',new.id,'actor_user_id',new.accepted_by,'actor_name',v_name,
      'subject_user_id',new.accepted_by,'subject_name',v_name,'record_id',new.id)
  from public.organization_memberships om
  where om.org_id=new.org_id and om.status='active' and om.user_id is distinct from new.accepted_by
    and om.role in ('org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager')
    and public.account_is_active(om.user_id)
  on conflict(user_id,deduplication_key) do nothing;
  return new;
end $$;

drop trigger if exists notify_org_managers_of_invite_acceptance_trigger on public.org_invites;
create trigger notify_org_managers_of_invite_acceptance_trigger
after update of status on public.org_invites for each row
when (new.status='accepted' and old.status is distinct from new.status)
execute function public.notify_org_managers_of_invite_acceptance();

-- Repair recent generic inbox rows only when the saved invitation proves the
-- actor. Already delivered pushes cannot be recalled.
update public.notifications n
set body=coalesce(nullif(trim(p.full_name),''),nullif(trim(i.invited_email),''),'A user')||' accepted your organization invite.',
    data=coalesce(n.data,'{}'::jsonb)||jsonb_build_object(
      'actor_user_id',i.accepted_by,
      'actor_name',coalesce(nullif(trim(p.full_name),''),nullif(trim(i.invited_email),''),'A user'),
      'subject_user_id',i.accepted_by,
      'subject_name',coalesce(nullif(trim(p.full_name),''),nullif(trim(i.invited_email),''),'A user'),
      'organization_id',i.org_id,'org_id',i.org_id,'record_id',i.id)
from public.org_invites i left join public.profiles p on p.id=i.accepted_by
where n.type in ('invite_accepted','org_invite_approval') and n.related_id=i.id
  and i.accepted_by is not null and n.created_at>=now()-interval '90 days';

-- Published plans may explicitly opt into family self-enrollment. Existing
-- assigned-only plans remain private by default.
alter table public.organization_recurring_fee_offers
  add column if not exists self_enrollment_enabled boolean not null default false;

notify pgrst,'reload schema';
