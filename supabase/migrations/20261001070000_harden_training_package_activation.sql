-- Permit the verified service-role webhook to activate package purchases and
-- make webhook retries idempotent (credits are granted only on first activation).

create or replace function public.activate_org_training_purchase(
  p_purchase_id uuid,
  p_payment_record_id uuid default null,
  p_stripe_subscription_id text default null,
  p_current_period_end timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_purchase public.org_training_package_purchases%rowtype;
  v_package public.org_training_packages%rowtype;
  v_was_active boolean;
begin
  if auth.role() <> 'service_role' and not public.is_admin(auth.uid()) then
    raise exception 'Only the verified payment backend can activate credits';
  end if;
  select * into v_purchase from public.org_training_package_purchases where id=p_purchase_id for update;
  if not found then raise exception 'Purchase not found'; end if;
  select * into v_package from public.org_training_packages where id=v_purchase.package_id;
  if not found then raise exception 'Package not found'; end if;
  v_was_active := v_purchase.status='active';

  update public.org_training_package_purchases set
    status='active', payment_record_id=coalesce(p_payment_record_id,payment_record_id),
    stripe_subscription_id=coalesce(p_stripe_subscription_id,stripe_subscription_id),
    current_period_end=case when v_package.billing_type='recurring' then coalesce(p_current_period_end,current_period_end) else null end,
    purchased_at=coalesce(purchased_at,now()),
    expires_at=case when v_package.billing_type='recurring' then null else coalesce(expires_at,now()+make_interval(days=>v_package.validity_days)) end,
    updated_at=now()
  where id=p_purchase_id;

  if not v_was_active then
    if v_package.group_credits>0 then
      insert into public.org_training_credit_ledger(purchase_id,athlete_id,credit_type,delta,reason,created_by)
      values(p_purchase_id,v_purchase.athlete_id,'group',v_package.group_credits,'purchase',v_purchase.purchaser_user_id);
    end if;
    if v_package.one_on_one_credits>0 then
      insert into public.org_training_credit_ledger(purchase_id,athlete_id,credit_type,delta,reason,created_by)
      values(p_purchase_id,v_purchase.athlete_id,'one_on_one',v_package.one_on_one_credits,'purchase',v_purchase.purchaser_user_id);
    end if;
  end if;
end;
$$;

revoke all on function public.activate_org_training_purchase(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.activate_org_training_purchase(uuid,uuid,text,timestamptz) to service_role;
notify pgrst, 'reload schema';
