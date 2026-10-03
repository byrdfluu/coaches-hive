-- Durable customer-facing purchase terms shared by every family storefront
-- offering. Existing rows retain their current purchase behavior.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'programs',
    'org_tryouts',
    'sessions',
    'org_training_packages',
    'marketplace_items',
    'org_fees',
    'organization_recurring_fee_offers'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I add column if not exists location text', table_name);
      execute format('alter table public.%I add column if not exists purchase_limit integer', table_name);
      execute format('alter table public.%I add column if not exists included_per_cycle integer', table_name);
      execute format('alter table public.%I add column if not exists cancellation_terms text', table_name);
      execute format('alter table public.%I add column if not exists credits_roll_over boolean', table_name);
      execute format('alter table public.%I add column if not exists refund_policy text', table_name);
      execute format(
        'alter table public.%I drop constraint if exists %I',
        table_name,
        table_name || '_purchase_limit_check'
      );
      execute format(
        'alter table public.%I add constraint %I check (purchase_limit is null or purchase_limit > 0)',
        table_name,
        table_name || '_purchase_limit_check'
      );
      execute format(
        'alter table public.%I drop constraint if exists %I',
        table_name,
        table_name || '_included_per_cycle_check'
      );
      execute format(
        'alter table public.%I add constraint %I check (included_per_cycle is null or included_per_cycle > 0)',
        table_name,
        table_name || '_included_per_cycle_check'
      );
    end if;
  end loop;
end $$;

-- A discoverable fee can be purchased once by an athlete unless staff creates
-- another distinct fee. Products and drop-in packages remain repeatable when
-- purchase_limit is null.
update public.org_fees set purchase_limit = 1 where purchase_limit is null;

comment on column public.programs.purchase_limit is 'Maximum successful purchases/registrations per athlete; null means no explicit limit.';
comment on column public.org_training_packages.included_per_cycle is 'Credits or sessions granted per recurring billing cycle.';
comment on column public.organization_recurring_fee_offers.credits_roll_over is 'Whether unused cycle benefits carry into the next billing cycle.';

notify pgrst, 'reload schema';
