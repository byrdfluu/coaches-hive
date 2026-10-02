-- Resolve the ambiguous PostgREST RPC created when the legacy four-argument
-- activation function and the cycle-safe six-argument function coexist.
-- Keep only the cycle-safe signature and make retries idempotent by cycle key.

alter table public.org_training_credit_ledger
  add column if not exists expires_at timestamptz,
  add column if not exists billing_cycle_key text;

create table if not exists public.org_training_billing_cycles (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.org_training_package_purchases(id) on delete restrict,
  cycle_key text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  stripe_invoice_id text,
  payment_record_id uuid,
  created_at timestamptz not null default now(),
  unique (purchase_id, cycle_key),
  check (period_end > period_start)
);

alter table public.org_training_billing_cycles enable row level security;
drop policy if exists org_training_cycles_read on public.org_training_billing_cycles;
create policy org_training_cycles_read on public.org_training_billing_cycles for select to authenticated
using (
  exists (
    select 1 from public.org_training_package_purchases purchase
    where purchase.id=purchase_id
      and (purchase.purchaser_user_id=auth.uid() or public.is_org_member(purchase.org_id) or public.is_admin(auth.uid()))
  )
);

drop function if exists public.activate_org_training_purchase(uuid,uuid,text,timestamptz);

create or replace function public.activate_org_training_purchase(
  p_purchase_id uuid,
  p_payment_record_id uuid default null,
  p_stripe_subscription_id text default null,
  p_current_period_end timestamptz default null,
  p_cycle_key text default null,
  p_stripe_invoice_id text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_purchase public.org_training_package_purchases%rowtype;
  v_package public.org_training_packages%rowtype;
  v_period_start timestamptz:=now();
  v_period_end timestamptz;
  v_cycle_key text;
  v_inserted uuid;
begin
  if auth.role()<>'service_role' and not public.is_admin(auth.uid()) then
    raise exception 'Only the verified payment backend can activate credits';
  end if;
  select * into v_purchase from public.org_training_package_purchases where id=p_purchase_id for update;
  if not found then raise exception 'Purchase not found'; end if;
  select * into v_package from public.org_training_packages where id=v_purchase.package_id;
  if not found then raise exception 'Package not found'; end if;

  v_period_end:=case when v_package.billing_type='recurring'
    then coalesce(p_current_period_end,now()+interval '1 month')
    else now()+make_interval(days=>v_package.validity_days) end;
  v_cycle_key:=coalesce(nullif(p_cycle_key,''),nullif(p_stripe_invoice_id,''),
    p_payment_record_id::text,p_purchase_id::text||':'||v_period_end::text);

  insert into public.org_training_billing_cycles(
    purchase_id,cycle_key,period_start,period_end,stripe_invoice_id,payment_record_id
  ) values(
    p_purchase_id,v_cycle_key,v_period_start,v_period_end,p_stripe_invoice_id,p_payment_record_id
  ) on conflict(purchase_id,cycle_key) do nothing returning id into v_inserted;

  update public.org_training_package_purchases set
    status='active',payment_record_id=coalesce(p_payment_record_id,payment_record_id),
    stripe_subscription_id=coalesce(p_stripe_subscription_id,stripe_subscription_id),
    current_period_end=case when v_package.billing_type='recurring' then v_period_end else null end,
    purchased_at=coalesce(purchased_at,now()),
    expires_at=case when v_package.billing_type='recurring' then null else v_period_end end,
    updated_at=now()
  where id=p_purchase_id;

  if v_inserted is null then return; end if;
  if v_package.group_credits>0 then
    insert into public.org_training_credit_ledger(
      purchase_id,athlete_id,credit_type,delta,reason,created_by,expires_at,billing_cycle_key
    ) values(
      p_purchase_id,v_purchase.athlete_id,'group',v_package.group_credits,
      'purchase',v_purchase.purchaser_user_id,v_period_end,v_cycle_key
    );
  end if;
  if v_package.one_on_one_credits>0 then
    insert into public.org_training_credit_ledger(
      purchase_id,athlete_id,credit_type,delta,reason,created_by,expires_at,billing_cycle_key
    ) values(
      p_purchase_id,v_purchase.athlete_id,'one_on_one',v_package.one_on_one_credits,
      'purchase',v_purchase.purchaser_user_id,v_period_end,v_cycle_key
    );
  end if;
end;
$$;

revoke all on function public.activate_org_training_purchase(uuid,uuid,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.activate_org_training_purchase(uuid,uuid,text,timestamptz,text,text) to service_role;
notify pgrst,'reload schema';
