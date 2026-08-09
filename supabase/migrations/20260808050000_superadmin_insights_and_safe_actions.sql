-- Superadmin insight state and guarded organization lifecycle actions.
-- Safe to rerun. Payment and immutable paperwork history remain protected.

create table if not exists public.admin_ops_issue_resolutions (
  issue_key text primary key,
  title text not null,
  detail text,
  category text,
  status text not null default 'resolved' check(status in ('open','resolved')),
  resolution_note text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  reopened_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.admin_revenue_summary()
returns table(total_revenue numeric,month_revenue numeric,transaction_count bigint)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  return query select
    coalesce(sum(p.amount),0),
    coalesce(sum(p.amount) filter(where p.created_at>=date_trunc('month',now())),0),
    count(*)
  from public.org_payments p
  where lower(coalesce(p.status,'')) in ('paid','succeeded','complete','completed');
end $$;

create or replace function public.admin_insights_summary()
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  select jsonb_build_object(
    'gross_volume_cents',coalesce((select sum(gross_amount_cents) from public.stripe_connect_payment_accounting),0),
    'platform_fee_cents',coalesce((select sum(platform_fee_cents) from public.stripe_connect_payment_accounting),0),
    'seller_net_cents',coalesce((select sum(net_amount_cents) from public.stripe_connect_payment_accounting),0),
    'refunded_amount_cents',coalesce((select sum(round(amount*100)) from public.payment_refund_requests where status='refunded'),0),
    'mrr_cents',coalesce((select sum(case when billing_interval='year' then coalesce(renewal_amount_cents,0)/12.0 else coalesce(renewal_amount_cents,0) end)
      from public.platform_subscriptions where status in ('active','trialing')),0),
    'active_subscriptions',(select count(*) from public.platform_subscriptions where status='active'),
    'trials',(select count(*) from public.platform_subscriptions where status='trialing'),
    'past_due',(select count(*) from public.platform_subscriptions where status in ('past_due','unpaid')),
    'canceled_30d',(select count(*) from public.platform_subscriptions where status='canceled' and updated_at>=now()-interval '30 days'),
    'accounts',(select count(*) from public.profiles),
    'workspaces',(select count(*) from public.business_workspaces where status='active'),
    'paid_accounts',(select count(*) from public.platform_subscriptions where status='active'),
    'failed_webhooks_24h',(select count(*) from public.stripe_webhook_events where status='failed' and received_at>=now()-interval '24 hours'),
    'processing_webhooks_24h',(select count(*) from public.stripe_webhook_events where status='processing' and received_at>=now()-interval '24 hours'),
    'failed_pushes_24h',(select count(*) from public.push_notification_deliveries where status<>'delivered' and created_at>=now()-interval '24 hours'),
    'delivered_pushes_24h',(select count(*) from public.push_notification_deliveries where status='delivered' and created_at>=now()-interval '24 hours'),
    'failed_handoffs_24h',(select count(*) from public.mobile_checkout_handoffs where last_error is not null and created_at>=now()-interval '24 hours'),
    'open_support',(select count(*) from public.support_tickets where status in ('open','in_progress')),
    'urgent_support',(select count(*) from public.support_tickets where status in ('open','in_progress') and priority in ('high','urgent'))
  ) into result;
  return result;
end $$;

create or replace function public.admin_organization_engagement()
returns table(workspace_id uuid,organization_id uuid,workspace_name text,member_count bigint,
  sessions_30d bigint,messages_30d bigint,payments_30d bigint,last_activity_at timestamptz,health_status text)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  return query
  select w.id,w.organization_id,w.display_name,
    (select count(*) from public.workspace_memberships m where m.workspace_id=w.id and m.status='active'),
    (select count(*) from public.sessions s where s.org_id=w.organization_id and s.created_at>=now()-interval '30 days'),
    (select count(*) from public.messages msg join public.threads th on th.id=msg.thread_id where th.org_id=w.organization_id and msg.created_at>=now()-interval '30 days'),
    (select count(*) from public.org_payments p where p.org_id=w.organization_id and p.created_at>=now()-interval '30 days'),
    greatest(
      coalesce((select max(s.updated_at) from public.sessions s where s.org_id=w.organization_id),w.created_at),
      coalesce((select max(msg.created_at) from public.messages msg join public.threads th on th.id=msg.thread_id where th.org_id=w.organization_id),w.created_at),
      coalesce((select max(p.created_at) from public.org_payments p where p.org_id=w.organization_id),w.created_at)
    ),
    case
      when greatest(
        coalesce((select max(s.updated_at) from public.sessions s where s.org_id=w.organization_id),w.created_at),
        coalesce((select max(msg.created_at) from public.messages msg join public.threads th on th.id=msg.thread_id where th.org_id=w.organization_id),w.created_at),
        coalesce((select max(p.created_at) from public.org_payments p where p.org_id=w.organization_id),w.created_at)
      )<now()-interval '30 days' then 'inactive'
      when (select count(*) from public.workspace_memberships m where m.workspace_id=w.id and m.status='active')<=1 then 'at_risk'
      else 'healthy' end
  from public.business_workspaces w where w.workspace_type='organization' and w.status='active'
  order by 8 asc;
end $$;

create or replace function public.admin_user_support_timeline(p_user_id uuid)
returns table(event_id text,event_type text,title text,detail text,status text,occurred_at timestamptz,record_id text)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  return query
    select 'support:'||t.id,'support',t.subject,coalesce(t.description,''),t.status,t.created_at,t.id::text from public.support_tickets t where t.user_id=p_user_id
    union all select 'notification:'||n.id,'notification',n.title,coalesce(n.body,''),case when n.read_at is null then 'unread' else 'read' end,n.created_at,n.id::text from public.notifications n where n.user_id=p_user_id
    union all select 'handoff:'||h.nonce,'checkout',h.checkout_type,coalesce(h.last_error,''),h.status,h.created_at,h.nonce from public.mobile_checkout_handoffs h where h.user_id=p_user_id
    union all select 'payment:'||p.id,'payment',coalesce(p.description,'Organization payment'),coalesce(p.amount::text,''),p.status,p.created_at,p.id::text from public.org_payments p where p.payer_id=p_user_id
    union all select 'workspace:'||e.id,'workspace',e.event_type,coalesce(e.record_type,''),null,e.occurred_at,e.id::text from public.workspace_audit_events e where e.actor_user_id=p_user_id
    order by 6 desc limit 250;
end $$;

create or replace function public.admin_system_failure_feed()
returns table(event_id text,source text,event_type text,status text,error_detail text,occurred_at timestamptz,workspace_id uuid)
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  return query
    select 'webhook:'||w.event_id,'Stripe webhook',w.event_type,w.status,coalesce(w.last_error,''),w.received_at,w.workspace_id
      from public.stripe_webhook_events w where w.status in ('failed','processing')
    union all select 'push:'||p.id,'APNs push',coalesce(p.apns_status::text,'delivery'),p.status,coalesce(p.failure_reason,''),p.created_at,null::uuid
      from public.push_notification_deliveries p where p.status<>'delivered'
    union all select 'handoff:'||h.nonce,'Checkout handoff',h.checkout_type,h.status,coalesce(h.last_error,''),h.created_at,h.workspace_id
      from public.mobile_checkout_handoffs h where h.last_error is not null or h.status in ('failed','expired')
    order by 6 desc limit 500;
end $$;
alter table public.admin_ops_issue_resolutions enable row level security;
drop policy if exists "superadmins manage ops resolutions" on public.admin_ops_issue_resolutions;
create policy "superadmins manage ops resolutions" on public.admin_ops_issue_resolutions
  for all to authenticated using(public.is_admin(auth.uid())) with check(public.is_admin(auth.uid()));

drop policy if exists "superadmins export coach waiver proofs" on public.coach_waiver_assignments;
create policy "superadmins export coach waiver proofs" on public.coach_waiver_assignments
  for select to authenticated using(public.is_admin(auth.uid()));
drop policy if exists "superadmins export organization document proofs" on public.org_document_completions;
create policy "superadmins export organization document proofs" on public.org_document_completions
  for select to authenticated using(public.is_admin(auth.uid()));

create or replace function public.admin_set_ops_issue_resolution(
  p_issue_key text,p_title text,p_detail text,p_category text,p_resolved boolean,p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  insert into public.admin_ops_issue_resolutions(
    issue_key,title,detail,category,status,resolution_note,resolved_by,resolved_at,reopened_at,updated_at
  ) values(
    p_issue_key,p_title,p_detail,p_category,case when p_resolved then 'resolved' else 'open' end,
    nullif(trim(p_note),''),case when p_resolved then auth.uid() else null end,
    case when p_resolved then now() else null end,case when p_resolved then null else now() end,now()
  ) on conflict(issue_key) do update set
    title=excluded.title,detail=excluded.detail,category=excluded.category,status=excluded.status,
    resolution_note=excluded.resolution_note,resolved_by=excluded.resolved_by,
    resolved_at=excluded.resolved_at,reopened_at=excluded.reopened_at,updated_at=now();
  insert into public.admin_audit_log(actor_id,target_type,action,metadata)
    values(auth.uid(),'ops_issue',case when p_resolved then 'admin.ops_issue.resolved' else 'admin.ops_issue.reopened' end,
      jsonb_build_object('issue_key',p_issue_key,'note',nullif(trim(p_note),'')));
end $$;

create or replace function public.admin_archive_organization(p_org_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare org_name text;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  if char_length(coalesce(trim(p_reason),''))<5 then raise exception 'Provide an archive reason'; end if;
  select coalesce(s.org_name,o.name,'Unnamed Org') into org_name
    from public.organizations o left join public.org_settings s on s.org_id=o.id where o.id=p_org_id;
  if not found then raise exception 'Organization not found'; end if;
  update public.organizations set status='archived',updated_at=now() where id=p_org_id;
  update public.business_workspaces set status='archived',updated_at=now() where organization_id=p_org_id;
  update public.organization_memberships set status='suspended',updated_at=now() where org_id=p_org_id;
  insert into public.admin_audit_log(actor_id,target_type,target_id,action,metadata)
    values(auth.uid(),'organization',p_org_id,'admin.organization.archived',jsonb_build_object('name',org_name,'reason',trim(p_reason)));
end $$;

create or replace function public.admin_delete_empty_test_organization(
  p_org_id uuid,p_confirmation text,p_reason text
) returns void language plpgsql security definer set search_path=public as $$
declare org_name text; protected_count bigint:=0;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Superadmin access required'; end if;
  if char_length(coalesce(trim(p_reason),''))<5 then raise exception 'Provide a deletion reason'; end if;
  select coalesce(s.org_name,o.name,'Unnamed Org') into org_name
    from public.organizations o left join public.org_settings s on s.org_id=o.id where o.id=p_org_id for update of o;
  if not found then raise exception 'Organization not found'; end if;
  if trim(p_confirmation)<>org_name then raise exception 'Type the exact organization name to confirm deletion'; end if;

  select
    (select count(*) from public.org_payments where org_id=p_org_id and lower(coalesce(status,'')) in ('paid','succeeded','complete','completed','refunded','disputed'))+
    (select count(*) from public.org_fee_assignments where org_id=p_org_id and lower(coalesce(status,'')) in ('paid','refunded','disputed'))+
    (select count(*) from public.platform_subscriptions where organization_id=p_org_id and (stripe_subscription_id is not null or status in ('active','trialing','past_due','canceled')))+
    (select count(*) from public.stripe_connect_accounts where org_id=p_org_id and stripe_account_id is not null)+
    (select count(*) from public.payment_refund_requests r where r.workspace_id in
      (select w.id from public.business_workspaces w where w.organization_id=p_org_id))+
    (select count(*) from public.order_disputes d where d.workspace_id in
      (select w.id from public.business_workspaces w where w.organization_id=p_org_id))+
    (select count(*) from public.coach_waiver_assignments a where a.workspace_id in
      (select w.id from public.business_workspaces w where w.organization_id=p_org_id)
      and a.signed_at is not null)+
    (select count(*) from public.org_document_completions c join public.org_documents d on d.id=c.document_id
      where d.org_id=p_org_id and (c.completed_at is not null or c.signature_hash is not null or lower(coalesce(c.status,'')) in ('signed','completed','complete')))
    into protected_count;
  if protected_count>0 then
    raise exception 'Permanent deletion blocked: this organization has financial, Connect, subscription, refund, dispute, signed-document, or immutable waiver history. Archive it instead.';
  end if;

  insert into public.admin_audit_log(actor_id,target_type,target_id,action,metadata)
    values(auth.uid(),'organization',p_org_id,'admin.organization.deleted',jsonb_build_object('name',org_name,'reason',trim(p_reason)));
  delete from public.organizations where id=p_org_id;
end $$;

revoke all on function public.admin_revenue_summary(),public.admin_insights_summary(),public.admin_organization_engagement(),
  public.admin_user_support_timeline(uuid),public.admin_set_ops_issue_resolution(text,text,text,text,boolean,text),
  public.admin_system_failure_feed(),
  public.admin_archive_organization(uuid,text),public.admin_delete_empty_test_organization(uuid,text,text) from public,anon;
grant execute on function public.admin_revenue_summary(),public.admin_insights_summary(),public.admin_organization_engagement(),
  public.admin_user_support_timeline(uuid),public.admin_set_ops_issue_resolution(text,text,text,text,boolean,text),
  public.admin_system_failure_feed(),
  public.admin_archive_organization(uuid,text),public.admin_delete_empty_test_organization(uuid,text,text) to authenticated;
