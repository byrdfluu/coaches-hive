-- Server-authoritative contracts used by the mobile Superadmin hardening UI.

drop function if exists public.admin_system_failure_feed();
create function public.admin_system_failure_feed()
returns table(
  event_id text, source text, event_type text, status text, error_detail text,
  occurred_at timestamptz, workspace_id uuid,
  request_id text, error_code text, route text, http_status integer,
  retryable boolean, app_version text, build_number text
)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  return query
    select 'webhook:'||w.event_id,'Stripe webhook',w.event_type,coalesce(w.status,'unknown'),coalesce(w.last_error,''),
      coalesce(w.received_at,w.processed_at),w.workspace_id,
      null::text,'stripe_webhook_failure'::text,'/api/stripe/webhook'::text,null::integer,
      true,null::text,null::text
    from public.stripe_webhook_events w where w.status in ('failed','processing')
    union all
    select 'push:'||p.id,'APNs push',coalesce(p.apns_status::text,'delivery'),p.status,coalesce(p.failure_reason,''),p.created_at,null::uuid,
      null::text,'push_delivery_failure'::text,null::text,p.apns_status,false,null::text,null::text
    from public.push_notification_deliveries p where p.status<>'delivered'
    union all
    select 'handoff:'||h.nonce,'Checkout handoff',h.checkout_type,h.status,coalesce(h.last_error,''),h.created_at,h.workspace_id,
      nullif(h.metadata->>'request_id',''),nullif(h.metadata->>'error_code',''),nullif(h.metadata->>'route',''),
      case when (h.metadata->>'http_status')~'^\d+$' then (h.metadata->>'http_status')::integer else null end,
      coalesce((h.metadata->>'retryable')::boolean,false),nullif(h.metadata->>'app_version',''),nullif(h.metadata->>'build_number','')
    from public.mobile_checkout_handoffs h where h.last_error is not null or h.status in ('failed','expired')
    order by 6 desc limit 500;
end $$;

create or replace function public.admin_transfer_workspace_ownership(
  p_workspace_id uuid,
  p_new_owner_user_id uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_workspace public.business_workspaces%rowtype;
  v_previous_owner uuid;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'A reason is required'; end if;
  if not exists(select 1 from public.profiles where id=p_new_owner_user_id) then raise exception 'New owner not found'; end if;

  select * into v_workspace from public.business_workspaces where id=p_workspace_id for update;
  if not found then raise exception 'Workspace not found'; end if;
  v_previous_owner := v_workspace.owner_user_id;

  if v_workspace.workspace_type='independent_coach' then
    update public.business_workspaces set owner_user_id=p_new_owner_user_id,updated_at=now() where id=p_workspace_id;
  end if;

  update public.workspace_memberships
    set roles=array_remove(roles,'owner'),updated_at=now()
    where workspace_id=p_workspace_id and user_id<>p_new_owner_user_id and 'owner'=any(roles);

  insert into public.workspace_memberships(workspace_id,user_id,roles,permissions,status)
  values(p_workspace_id,p_new_owner_user_id,array['owner']::text[],jsonb_build_object('manage_payments',true,'manage_connect',true),'active')
  on conflict(workspace_id,user_id) do update set
    roles=(select array_agg(distinct role_name) from unnest(public.workspace_memberships.roles||array['owner']::text[]) role_name),
    status='active',updated_at=now();

  insert into public.workspace_audit_events(workspace_id,actor_user_id,acting_role,event_type,record_type,record_id,metadata,occurred_at)
  values(p_workspace_id,auth.uid(),'superadmin','workspace_ownership_transferred','workspace',p_workspace_id,
    jsonb_build_object('previous_owner_user_id',v_previous_owner,'new_owner_user_id',p_new_owner_user_id,'reason',trim(p_reason)),now());
  insert into public.admin_audit_log(actor_id,target_type,target_id,action,workspace_id,metadata)
  values(auth.uid(),'workspace',p_workspace_id,'admin.workspace.transfer_ownership',p_workspace_id,
    jsonb_build_object('previous_owner_user_id',v_previous_owner,'new_owner_user_id',p_new_owner_user_id,'reason',trim(p_reason)));

  return jsonb_build_object('workspace_id',p_workspace_id,'previous_owner_user_id',v_previous_owner,
    'new_owner_user_id',p_new_owner_user_id,'transferred',true);
end $$;

revoke all on function public.admin_transfer_workspace_ownership(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_transfer_workspace_ownership(uuid,uuid,text) to authenticated;

notify pgrst, 'reload schema';
