-- Workspace linkage required by the web superadmin operations console.
-- Payment/subscription state remains webhook-authoritative; these columns are
-- attribution and filtering data only.

alter table if exists public.stripe_connect_payment_accounting
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete restrict;
alter table if exists public.payment_refund_requests
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete restrict;
alter table if exists public.order_disputes
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete restrict;
alter table if exists public.orders
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete restrict;
alter table if exists public.stripe_webhook_events
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete set null;
alter table if exists public.app_store_server_notifications
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete set null;
alter table if exists public.admin_audit_log
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete set null;

create index if not exists stripe_connect_accounting_workspace_idx
  on public.stripe_connect_payment_accounting(workspace_id,created_at desc);
create index if not exists refund_requests_workspace_idx
  on public.payment_refund_requests(workspace_id,requested_at desc);
create index if not exists order_disputes_workspace_idx
  on public.order_disputes(workspace_id,created_at desc);
create index if not exists stripe_webhook_events_workspace_idx
  on public.stripe_webhook_events(workspace_id,received_at desc);
create index if not exists app_store_notifications_workspace_idx
  on public.app_store_server_notifications(workspace_id,created_at desc);
create index if not exists admin_audit_log_workspace_idx
  on public.admin_audit_log(workspace_id,created_at desc);

-- Backfill only deterministic ownership. Ambiguous legacy records intentionally
-- remain null and visible in the reconciliation queue.
update public.stripe_connect_payment_accounting a
set workspace_id = c.workspace_id
from public.stripe_connect_accounts c
where a.workspace_id is null
  and c.stripe_account_id = a.connected_account_destination
  and c.workspace_id is not null;

update public.payment_refund_requests r
set workspace_id = coalesce(
  case when r.payment_type = 'org_fee' then
    (select a.workspace_id from public.org_fee_assignments a where a.id = r.payment_record_id)
  end,
  case when r.payment_type = 'coach_fee' then
    (select a.workspace_id from public.coach_fee_assignments a where a.id = r.payment_record_id)
  end,
  case when r.payment_type = 'marketplace_order' then
    (select o.workspace_id from public.marketplace_orders o where o.id = r.payment_record_id)
  end
)
where r.workspace_id is null;

update public.orders o set workspace_id=coalesce(
  (select w.id from public.business_workspaces w where w.organization_id=o.org_id),
  (select w.id from public.business_workspaces w where w.workspace_type='independent_coach' and w.owner_user_id=o.coach_id)
) where o.workspace_id is null;

create or replace function public.assign_refund_request_workspace()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.workspace_id is not null then return new; end if;
  if new.payment_type = 'org_fee' then
    select workspace_id into new.workspace_id from public.org_fee_assignments where id=new.payment_record_id;
  elsif new.payment_type = 'coach_fee' then
    select workspace_id into new.workspace_id from public.coach_fee_assignments where id=new.payment_record_id;
  elsif new.payment_type = 'marketplace_order' then
    select workspace_id into new.workspace_id from public.marketplace_orders where id=new.payment_record_id;
  end if;
  return new;
end $$;
drop trigger if exists assign_refund_request_workspace_trigger on public.payment_refund_requests;
create trigger assign_refund_request_workspace_trigger before insert on public.payment_refund_requests
for each row execute function public.assign_refund_request_workspace();

create or replace function public.assign_order_dispute_workspace()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.workspace_id is not null then return new; end if;
  if new.fee_assignment_id is not null then
    select workspace_id into new.workspace_id from public.org_fee_assignments where id=new.fee_assignment_id;
  end if;
  if new.workspace_id is null and new.order_id is not null then
    select workspace_id into new.workspace_id from public.orders where id=new.order_id;
  end if;
  if new.workspace_id is null and new.payment_intent_id is not null then
    select workspace_id into new.workspace_id from public.stripe_connect_payment_accounting
      where stripe_payment_intent_id=new.payment_intent_id;
  end if;
  return new;
end $$;
drop trigger if exists assign_order_dispute_workspace_trigger on public.order_disputes;
create trigger assign_order_dispute_workspace_trigger before insert or update on public.order_disputes
for each row execute function public.assign_order_dispute_workspace();

create or replace view public.workspace_admin_reconciliation_queue as
select table_name,id,created_at from public.workspace_reconciliation_queue
union all
select 'stripe_connect_payment_accounting',id,created_at
from public.stripe_connect_payment_accounting where workspace_id is null
union all
select 'payment_refund_requests',id,requested_at
from public.payment_refund_requests where workspace_id is null
union all
select 'order_disputes',id,created_at
from public.order_disputes where workspace_id is null;

revoke all on public.workspace_admin_reconciliation_queue from public,anon,authenticated;
grant select on public.workspace_admin_reconciliation_queue to service_role;
