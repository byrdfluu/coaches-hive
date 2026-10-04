-- Forward-only correction: distinguish payment transaction IDs from source
-- record IDs and persist mobile organization-resolution idempotency results.

alter table public.payment_refund_requests
  add column if not exists payment_transaction_id uuid references public.payment_transactions(id) on delete restrict;

update public.payment_refund_requests request set payment_transaction_id=request.payment_record_id
where request.payment_transaction_id is null and exists(select 1 from public.payment_transactions tx where tx.id=request.payment_record_id);

update public.payment_refund_requests request set payment_transaction_id=(
  select tx.id from public.payment_transactions tx
  where tx.source_record_id=request.payment_record_id
    and (request.org_id is null or tx.org_id=request.org_id)
    and (request.athlete_id is null or tx.athlete_profile_id=request.athlete_id)
  order by tx.occurred_at desc limit 1
) where request.payment_transaction_id is null and exists(
  select 1 from public.payment_transactions tx where tx.source_record_id=request.payment_record_id
    and (request.org_id is null or tx.org_id=request.org_id)
    and (request.athlete_id is null or tx.athlete_profile_id=request.athlete_id)
);

create table if not exists public.refund_resolution_attempts(
  id uuid primary key default gen_random_uuid(),
  refund_request_id uuid not null references public.payment_refund_requests(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check(action in('money_refund','credits_only','money_and_credits')),
  idempotency_key uuid not null,
  status text not null default 'processing' check(status in('processing','completed','failed')),
  response_body jsonb,
  request_id text,
  resolution_note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(organization_id,idempotency_key)
);
alter table public.refund_resolution_attempts enable row level security;
drop policy if exists refund_resolution_attempts_org_read on public.refund_resolution_attempts;
create policy refund_resolution_attempts_org_read on public.refund_resolution_attempts for select to authenticated using(
  public.is_admin(auth.uid()) or public.organization_has_permission(organization_id,'manage_payments',auth.uid())
);

create or replace function public.restore_refund_training_credits(
  p_refund_request_id uuid,p_group_credits integer,p_one_on_one_credits integer,
  p_actor_user_id uuid,p_resolution_note text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r public.payment_refund_requests%rowtype;tx public.payment_transactions%rowtype;
  purchase public.org_training_package_purchases%rowtype;package public.org_training_packages%rowtype;
  v_purchase_id uuid;cycle_key text;
  max_group integer:=0;max_one integer:=0;used_group integer:=0;used_one integer:=0;
  result_row public.refund_credit_restorations%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required';end if;
  if nullif(trim(p_resolution_note),'') is null then raise exception 'A resolution note is required';end if;
  if coalesce(p_group_credits,0)<0 or coalesce(p_one_on_one_credits,0)<0 or coalesce(p_group_credits,0)+coalesce(p_one_on_one_credits,0)=0 then raise exception 'A positive credit quantity is required';end if;
  select * into r from public.payment_refund_requests where id=p_refund_request_id for update;
  if not found or r.org_id is null then raise exception 'Organization refund request not found';end if;
  if r.payment_type not in('training_package','training_session','recurring_renewal') then raise exception 'This payment did not grant restorable training credits';end if;
  if not public.organization_has_permission(r.org_id,'manage_payments',p_actor_user_id) then raise exception 'Payment management permission required';end if;
  select * into result_row from public.refund_credit_restorations where refund_request_id=r.id;
  if found then return jsonb_build_object('restored_group_credits',result_row.group_credits,'restored_one_on_one_credits',result_row.one_on_one_credits,'reused',true);end if;

  select * into tx from public.payment_transactions where id=r.payment_transaction_id;
  if not found then
    select * into tx from public.payment_transactions where id=r.payment_record_id;
  end if;
  if not found then
    select * into tx from public.payment_transactions where source_record_id=r.payment_record_id
      and org_id=r.org_id and athlete_profile_id=r.athlete_id order by occurred_at desc limit 1;
  end if;
  if not found then raise exception 'Authoritative payment transaction not found';end if;
  update public.payment_refund_requests set payment_transaction_id=tx.id where id=r.id and payment_transaction_id is null;
  begin v_purchase_id:=nullif(tx.metadata->>'purchase_id','')::uuid;exception when invalid_text_representation then v_purchase_id:=null;end;
  v_purchase_id:=coalesce(v_purchase_id,case when tx.source_record_type ilike '%training%' then tx.source_record_id else null end);
  select * into purchase from public.org_training_package_purchases where id=v_purchase_id and athlete_id=r.athlete_id and org_id=r.org_id;
  if not found then raise exception 'Training purchase attribution is unavailable';end if;
  select * into package from public.org_training_packages where id=purchase.package_id and org_id=r.org_id;
  if not found then raise exception 'Training package attribution is unavailable';end if;
  cycle_key:=coalesce(tx.stripe_invoice_id,tx.metadata->>'stripe_invoice_id',tx.id::text);
  select coalesce(sum(case when credit_type='group' then delta else 0 end),0),coalesce(sum(case when credit_type='one_on_one' then delta else 0 end),0)
    into max_group,max_one from public.org_training_credit_ledger
    where org_training_credit_ledger.purchase_id=purchase.id and delta>0 and reason in('purchase','renewal')
      and (billing_cycle_key=cycle_key or (tx.stripe_invoice_id is null and billing_cycle_key is not distinct from purchase.id::text));
  if max_group=0 and max_one=0 then max_group:=package.group_credits;max_one:=package.one_on_one_credits;end if;
  select coalesce(sum(group_credits),0),coalesce(sum(one_on_one_credits),0) into used_group,used_one from public.refund_credit_restorations
    where purchase_id=purchase.id and billing_cycle_key is not distinct from cycle_key;
  if p_group_credits>greatest(0,max_group-used_group) or p_one_on_one_credits>greatest(0,max_one-used_one) then raise exception 'Requested credits exceed the original grant';end if;
  insert into public.refund_credit_restorations(refund_request_id,original_payment_transaction_id,purchase_id,athlete_id,organization_id,package_id,billing_cycle_key,group_credits,one_on_one_credits,resolved_by,resolution_note)
    values(r.id,tx.id,purchase.id,purchase.athlete_id,r.org_id,package.id,cycle_key,p_group_credits,p_one_on_one_credits,p_actor_user_id,trim(p_resolution_note)) returning * into result_row;
  if p_group_credits>0 then insert into public.org_training_credit_ledger(purchase_id,athlete_id,credit_type,delta,reason,created_by,billing_cycle_key,refund_request_id,organization_id,package_id)
    values(purchase.id,purchase.athlete_id,'group',p_group_credits,'refund_credit_restoration',p_actor_user_id,cycle_key,r.id,r.org_id,package.id);end if;
  if p_one_on_one_credits>0 then insert into public.org_training_credit_ledger(purchase_id,athlete_id,credit_type,delta,reason,created_by,billing_cycle_key,refund_request_id,organization_id,package_id)
    values(purchase.id,purchase.athlete_id,'one_on_one',p_one_on_one_credits,'refund_credit_restoration',p_actor_user_id,cycle_key,r.id,r.org_id,package.id);end if;
  update public.payment_refund_requests set restored_group_credits=p_group_credits,restored_one_on_one_credits=p_one_on_one_credits,credits_restored_at=now(),resolved_by_org_user_id=p_actor_user_id,resolution_note=trim(p_resolution_note),updated_at=now() where id=r.id;
  insert into public.workspace_audit_events(workspace_id,actor_user_id,acting_role,event_type,record_type,record_id,metadata,occurred_at)
    values(r.workspace_id,p_actor_user_id,'org_director','refund_credits_restored','payment_refund_request',r.id,jsonb_build_object('group_credits',p_group_credits,'one_on_one_credits',p_one_on_one_credits,'purchase_id',purchase.id,'payment_transaction_id',tx.id,'billing_cycle_key',cycle_key,'reason',trim(p_resolution_note)),now());
  return jsonb_build_object('restored_group_credits',p_group_credits,'restored_one_on_one_credits',p_one_on_one_credits,'reused',false);
end $$;
revoke all on function public.restore_refund_training_credits(uuid,integer,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.restore_refund_training_credits(uuid,integer,integer,uuid,text) to service_role;

notify pgrst,'reload schema';
