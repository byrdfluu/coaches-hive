-- The existing payment-state guard treats binding a newly-created Stripe
-- Checkout Session as a final payment-state mutation. That causes the server
-- to create and then immediately expire valid program/tryout sessions. Replace
-- only guards containing that exact legacy exception with a guard that keeps
-- final payment fields webhook-only while allowing the service role to bind a
-- pending checkout session.

do $$
declare
  trigger_row record;
begin
  for trigger_row in
    select ns.nspname as schema_name, cls.relname as table_name, trg.tgname
    from pg_trigger trg
    join pg_class cls on cls.oid=trg.tgrelid
    join pg_namespace ns on ns.oid=cls.relnamespace
    join pg_proc proc on proc.oid=trg.tgfoid
    where not trg.tgisinternal
      and ns.nspname='public'
      and cls.relname in ('program_registrations','org_tryout_registrations')
      and pg_get_functiondef(proc.oid) ilike '%Final payment state can only be changed by the trusted payment service%'
  loop
    execute format('drop trigger if exists %I on %I.%I', trigger_row.tgname, trigger_row.schema_name, trigger_row.table_name);
  end loop;
end $$;

create or replace function public.protect_registration_payment_state()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  -- Next.js uses the service role to reserve/bind Checkout. Stripe webhooks use
  -- that same trusted server boundary for final fulfillment.
  if auth.role()='service_role' then return new; end if;

  if new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
    or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
    or new.status is distinct from old.status
  then
    raise exception 'Payment state can only be changed by the trusted payment service';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_program_registration_payment_state on public.program_registrations;
create trigger protect_program_registration_payment_state
before update of status,stripe_checkout_session_id,stripe_payment_intent_id
on public.program_registrations for each row
execute function public.protect_registration_payment_state();

drop trigger if exists protect_tryout_registration_payment_state on public.org_tryout_registrations;
create trigger protect_tryout_registration_payment_state
before update of status,stripe_checkout_session_id,stripe_payment_intent_id
on public.org_tryout_registrations for each row
execute function public.protect_registration_payment_state();

notify pgrst, 'reload schema';
