alter table public.payment_refund_requests drop constraint if exists payment_refund_requests_payment_type_check;
alter table public.payment_refund_requests add constraint payment_refund_requests_payment_type_check check(payment_type in(
  'org_fee','coach_fee','marketplace_order','league_fee','program','tryout','training_package','training_session','recurring_renewal'
));
alter table public.payment_refund_requests add column if not exists idempotency_key text;
create unique index if not exists payment_refund_requests_requester_idempotency_uidx
  on public.payment_refund_requests(requester_id,idempotency_key) where idempotency_key is not null;

create or replace function public.assign_refund_request_owner_scope()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.org_id is not null or new.coach_id is not null or new.league_id is not null then return new; end if;
  if new.payment_type in ('program','tryout','training_package','training_session','recurring_renewal') then
    select tx.org_id into new.org_id from public.payment_transactions tx where tx.id=new.payment_record_id;
  elsif new.payment_type='org_fee' then
    select f.org_id into new.org_id from public.org_fee_assignments a join public.org_fees f on f.id=a.fee_id where a.id=new.payment_record_id;
  elsif new.payment_type='coach_fee' then
    select a.coach_id into new.coach_id from public.coach_fee_assignments a where a.id=new.payment_record_id;
  elsif new.payment_type='marketplace_order' then
    select o.coach_id,o.org_id into new.coach_id,new.org_id from public.marketplace_orders o where o.id=new.payment_record_id;
    if new.coach_id is not null then new.org_id:=null; end if;
  elsif new.payment_type='league_fee' then
    select a.league_id into new.league_id from public.league_fee_assignments a where a.id=new.payment_record_id;
  end if;
  return new;
end $$;
notify pgrst,'reload schema';
