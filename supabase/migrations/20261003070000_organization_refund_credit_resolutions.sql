-- Organization-owned refund resolutions. Money and credit operations remain
-- separate, durable, and idempotent authorities.

alter table public.payment_refund_requests
  add column if not exists resolution_mode text,
  add column if not exists resolved_by_org_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists resolution_started_at timestamptz,
  add column if not exists credits_restored_at timestamptz,
  add column if not exists restored_group_credits integer not null default 0,
  add column if not exists restored_one_on_one_credits integer not null default 0;

alter table public.payment_refund_requests drop constraint if exists payment_refund_requests_resolution_mode_check;
alter table public.payment_refund_requests add constraint payment_refund_requests_resolution_mode_check
  check(resolution_mode is null or resolution_mode in ('money_refund','credits_only','money_and_credits','rejected'));

alter table public.payment_refund_requests drop constraint if exists payment_refund_requests_status_check;
alter table public.payment_refund_requests add constraint payment_refund_requests_status_check check(status in(
  'requested','under_review','approved','rejected','processing','refunded','failed','canceled',
  'credits_restored','refund_processing','partially_refunded','refund_and_credits_completed'
));

alter table public.payment_refund_requests drop constraint if exists payment_refund_requests_payment_type_check;
alter table public.payment_refund_requests add constraint payment_refund_requests_payment_type_check check(payment_type in(
  'org_fee','coach_fee','marketplace_order','league_fee','program','tryout','training_package','training_session','recurring_renewal','platform_subscription'
));

alter table public.org_training_credit_ledger
  add column if not exists refund_request_id uuid references public.payment_refund_requests(id) on delete restrict,
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists package_id uuid references public.org_training_packages(id) on delete restrict;

create unique index if not exists org_training_refund_credit_once_uidx
  on public.org_training_credit_ledger(refund_request_id,credit_type)
  where refund_request_id is not null and reason='refund_credit_restoration';

create table if not exists public.refund_credit_restorations(
  id uuid primary key default gen_random_uuid(),
  refund_request_id uuid not null unique references public.payment_refund_requests(id) on delete restrict,
  original_payment_transaction_id uuid not null references public.payment_transactions(id) on delete restrict,
  purchase_id uuid not null references public.org_training_package_purchases(id) on delete restrict,
  athlete_id uuid not null references public.athlete_profiles(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  package_id uuid not null references public.org_training_packages(id) on delete restrict,
  billing_cycle_key text,
  group_credits integer not null default 0 check(group_credits>=0),
  one_on_one_credits integer not null default 0 check(one_on_one_credits>=0),
  resolved_by uuid not null references public.profiles(id) on delete restrict,
  resolution_note text not null,
  created_at timestamptz not null default now(),
  check(group_credits>0 or one_on_one_credits>0)
);
alter table public.refund_credit_restorations enable row level security;
create policy refund_credit_restorations_org_read on public.refund_credit_restorations for select to authenticated using(
  public.is_admin(auth.uid()) or public.organization_has_permission(organization_id,'manage_payments',auth.uid())
);

create or replace function public.prevent_refund_credit_restoration_mutation()
returns trigger language plpgsql as $$ begin raise exception 'Credit restoration entries are immutable'; end $$;
drop trigger if exists refund_credit_restorations_immutable on public.refund_credit_restorations;
create trigger refund_credit_restorations_immutable before update or delete on public.refund_credit_restorations
for each row execute function public.prevent_refund_credit_restoration_mutation();

create or replace function public.restore_refund_training_credits(
  p_refund_request_id uuid,p_group_credits integer,p_one_on_one_credits integer,
  p_actor_user_id uuid,p_resolution_note text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  r public.payment_refund_requests%rowtype;
  tx public.payment_transactions%rowtype;
  purchase public.org_training_package_purchases%rowtype;
  package public.org_training_packages%rowtype;
  v_purchase_id uuid;
  cycle_key text;
  max_group integer:=0; max_one integer:=0; used_group integer:=0; used_one integer:=0;
  result_row public.refund_credit_restorations%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  if nullif(trim(p_resolution_note),'') is null then raise exception 'A resolution note is required'; end if;
  if coalesce(p_group_credits,0)<0 or coalesce(p_one_on_one_credits,0)<0 or coalesce(p_group_credits,0)+coalesce(p_one_on_one_credits,0)=0 then raise exception 'A positive credit quantity is required'; end if;

  select * into r from public.payment_refund_requests where id=p_refund_request_id for update;
  if not found or r.org_id is null then raise exception 'Organization refund request not found'; end if;
  if r.payment_type not in ('training_package','recurring_renewal') then raise exception 'This payment did not grant restorable training credits'; end if;
  if not public.organization_has_permission(r.org_id,'manage_payments',p_actor_user_id) then raise exception 'Payment management permission required'; end if;

  select * into result_row from public.refund_credit_restorations where refund_request_id=r.id;
  if found then return jsonb_build_object('restored_group_credits',result_row.group_credits,'restored_one_on_one_credits',result_row.one_on_one_credits,'reused',true); end if;

  select * into tx from public.payment_transactions where id=r.payment_record_id;
  if not found then raise exception 'Authoritative payment transaction not found'; end if;
  begin v_purchase_id:=nullif(tx.metadata->>'purchase_id','')::uuid; exception when invalid_text_representation then v_purchase_id:=null; end;
  v_purchase_id:=coalesce(v_purchase_id,case when tx.source_record_type ilike '%training%' then tx.source_record_id else null end);
  select * into purchase from public.org_training_package_purchases where id=v_purchase_id and athlete_id=r.athlete_id and org_id=r.org_id;
  if not found then raise exception 'Training purchase attribution is unavailable'; end if;
  select * into package from public.org_training_packages where id=purchase.package_id and org_id=r.org_id;
  if not found then raise exception 'Training package attribution is unavailable'; end if;
  cycle_key:=coalesce(tx.stripe_invoice_id,tx.metadata->>'stripe_invoice_id',tx.id::text);

  select coalesce(sum(case when credit_type='group' then delta else 0 end),0),
         coalesce(sum(case when credit_type='one_on_one' then delta else 0 end),0)
    into max_group,max_one from public.org_training_credit_ledger
    where org_training_credit_ledger.purchase_id=purchase.id and delta>0 and reason in ('purchase','renewal')
      and (billing_cycle_key=cycle_key or (tx.stripe_invoice_id is null and billing_cycle_key is not distinct from purchase.id::text));
  if max_group=0 and max_one=0 then max_group:=package.group_credits;max_one:=package.one_on_one_credits;end if;
  select coalesce(sum(group_credits),0),coalesce(sum(one_on_one_credits),0) into used_group,used_one
    from public.refund_credit_restorations where purchase_id=purchase.id and billing_cycle_key is not distinct from cycle_key;
  if p_group_credits>greatest(0,max_group-used_group) or p_one_on_one_credits>greatest(0,max_one-used_one) then raise exception 'Requested credits exceed the original grant'; end if;

  insert into public.refund_credit_restorations(refund_request_id,original_payment_transaction_id,purchase_id,athlete_id,organization_id,package_id,billing_cycle_key,group_credits,one_on_one_credits,resolved_by,resolution_note)
  values(r.id,tx.id,purchase.id,purchase.athlete_id,r.org_id,package.id,cycle_key,p_group_credits,p_one_on_one_credits,p_actor_user_id,trim(p_resolution_note)) returning * into result_row;
  if p_group_credits>0 then insert into public.org_training_credit_ledger(purchase_id,athlete_id,credit_type,delta,reason,created_by,billing_cycle_key,refund_request_id,organization_id,package_id)
    values(purchase.id,purchase.athlete_id,'group',p_group_credits,'refund_credit_restoration',p_actor_user_id,cycle_key,r.id,r.org_id,package.id); end if;
  if p_one_on_one_credits>0 then insert into public.org_training_credit_ledger(purchase_id,athlete_id,credit_type,delta,reason,created_by,billing_cycle_key,refund_request_id,organization_id,package_id)
    values(purchase.id,purchase.athlete_id,'one_on_one',p_one_on_one_credits,'refund_credit_restoration',p_actor_user_id,cycle_key,r.id,r.org_id,package.id); end if;
  update public.payment_refund_requests set restored_group_credits=p_group_credits,restored_one_on_one_credits=p_one_on_one_credits,
    credits_restored_at=now(),resolved_by_org_user_id=p_actor_user_id,resolution_note=trim(p_resolution_note),updated_at=now() where id=r.id;
  insert into public.workspace_audit_events(workspace_id,actor_user_id,acting_role,event_type,record_type,record_id,metadata,occurred_at)
    values(r.workspace_id,p_actor_user_id,'org_director','refund_credits_restored','payment_refund_request',r.id,
      jsonb_build_object('group_credits',p_group_credits,'one_on_one_credits',p_one_on_one_credits,'purchase_id',purchase.id,'billing_cycle_key',cycle_key,'reason',trim(p_resolution_note)),now());
  return jsonb_build_object('restored_group_credits',p_group_credits,'restored_one_on_one_credits',p_one_on_one_credits,'reused',false);
end $$;
revoke all on function public.restore_refund_training_credits(uuid,integer,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.restore_refund_training_credits(uuid,integer,integer,uuid,text) to service_role;

alter table public.offering_recurring_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.org_training_package_purchases add column if not exists cancel_at_period_end boolean not null default false;

create or replace function public.record_refund_request_state(
  p_request_id uuid,p_status text,p_stripe_refund_id text default null,p_stripe_refund_status text default null,
  p_refunded_amount_cents bigint default null,p_resolution_note text default null,p_approved_by uuid default null,p_audit_metadata jsonb default '{}'::jsonb
) returns public.payment_refund_requests language plpgsql security definer set search_path=public as $$
declare v_row public.payment_refund_requests%rowtype;v_now timestamptz:=clock_timestamp();
begin
  if p_status not in ('requested','under_review','approved','rejected','processing','refunded','failed','canceled','credits_restored','refund_processing','partially_refunded','refund_and_credits_completed') then raise exception 'Unsupported refund status'; end if;
  select * into v_row from public.payment_refund_requests where id=p_request_id for update;if not found then raise exception 'Refund request not found';end if;
  if v_row.status in ('refunded','refund_and_credits_completed') and p_status not in ('refunded','refund_and_credits_completed') then return v_row;end if;
  update public.payment_refund_requests set status=p_status,stripe_refund_id=coalesce(p_stripe_refund_id,stripe_refund_id),stripe_refund_status=coalesce(p_stripe_refund_status,stripe_refund_status),
    refunded_amount_cents=coalesce(p_refunded_amount_cents,refunded_amount_cents),resolution_note=coalesce(p_resolution_note,resolution_note),approved_by=coalesce(p_approved_by,approved_by),
    approved_at=case when p_approved_by is not null then coalesce(approved_at,v_now) else approved_at end,audit_metadata=coalesce(audit_metadata,'{}'::jsonb)||coalesce(p_audit_metadata,'{}'::jsonb),
    resolved_at=case when p_status in ('rejected','refunded','failed','canceled','credits_restored','refund_and_credits_completed') then coalesce(resolved_at,v_now) else null end,updated_at=v_now
  where id=p_request_id returning * into v_row;return v_row;
end $$;
revoke all on function public.record_refund_request_state(uuid,text,text,text,bigint,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_refund_request_state(uuid,text,text,text,bigint,text,uuid,jsonb) to service_role;

notify pgrst,'reload schema';
