begin;

with unambiguous as(
  select m.thread_id,min(w.organization_id::text)::uuid organization_id
  from messages m join business_workspaces w on w.id=m.workspace_id
  where w.workspace_type='organization'and w.organization_id is not null
    and w.status='active'and coalesce(w.is_test,false)=false
  group by m.thread_id having count(distinct w.organization_id)=1
)
update threads t set org_id=u.organization_id,organization_id=u.organization_id,
  organization_display_name=o.name,organization_profile_image_url=s.profile_image_url
from unambiguous u join organizations o on o.id=u.organization_id
left join org_settings s on s.org_id=o.id
where t.id=u.thread_id and t.org_id is null and t.organization_id is null;

create or replace function public.reconcile_message_thread_organization_identity()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_name text;v_image text;
begin
 if new.workspace_id is null then return new;end if;
 select w.organization_id,o.name,s.profile_image_url into v_org,v_name,v_image
 from business_workspaces w join organizations o on o.id=w.organization_id
 left join org_settings s on s.org_id=o.id
 where w.id=new.workspace_id and w.workspace_type='organization'and w.status='active'
   and coalesce(w.is_test,false)=false and coalesce(o.is_test,false)=false;
 if v_org is not null then update threads set org_id=coalesce(org_id,v_org),organization_id=coalesce(organization_id,v_org),
   organization_display_name=case when coalesce(organization_id,org_id,v_org)=v_org then v_name else organization_display_name end,
   organization_profile_image_url=case when coalesce(organization_id,org_id,v_org)=v_org then v_image else organization_profile_image_url end
   where id=new.thread_id and coalesce(organization_id,org_id,v_org)=v_org;end if;
 return new;
end $$;
drop trigger if exists reconcile_message_thread_organization_identity_trigger on public.messages;
create trigger reconcile_message_thread_organization_identity_trigger after insert or update of workspace_id on public.messages
for each row execute function public.reconcile_message_thread_organization_identity();

notify pgrst,'reload schema';commit;
