-- Web writes amount_cents (drives the actual Stripe charge); iOS's fee editor
-- only writes the decimal amount column. With no sync between them, an edit
-- on one client silently stops showing on the other.
--
-- org_fees is a plain template — amount and amount_cents can sync freely
-- either direction, whichever column a client actually wrote.
--
-- org_fee_assignments is different: a prior migration
-- (20260812050000_org_fee_assignment_amount_snapshot.sql) deliberately made
-- `amount` immutable once set, so editing a fee template later can never
-- retroactively change what an athlete already owes. `amount_cents` was
-- never given the same protection, so it silently drifted to track the fee
-- template's current price instead of staying locked to the assignment's
-- snapshot. Fix: extend that same snapshot trigger to cover amount_cents
-- too, and reconcile existing drift using the already-protected `amount` as
-- the source of truth (not the other way around).

-- Defensive cleanup in case an earlier failed attempt at this migration
-- partially applied before rolling back.
drop trigger if exists sync_org_fee_assignments_amount on public.org_fee_assignments;
drop function if exists public.sync_org_fee_amount_columns() cascade;

update public.org_fees
set amount = round(amount_cents::numeric / 100, 2)
where amount_cents is not null
  and (amount is null or round(amount_cents::numeric / 100, 2) <> amount);

update public.org_fee_assignments
set amount_cents = round(amount * 100)
where amount is not null
  and (amount_cents is null or round(amount * 100) <> amount_cents);

create or replace function public.sync_org_fees_amount_columns()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.amount_cents is not null then
      new.amount := round(new.amount_cents::numeric / 100, 2);
    elsif new.amount is not null then
      new.amount_cents := round(new.amount * 100);
    end if;
    return new;
  end if;

  -- UPDATE: whichever column the client actually changed wins for this write.
  if new.amount_cents is distinct from old.amount_cents then
    new.amount := round(new.amount_cents::numeric / 100, 2);
  elsif new.amount is distinct from old.amount then
    new.amount_cents := round(new.amount * 100);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists sync_org_fees_amount on public.org_fees;
create trigger sync_org_fees_amount
  before insert or update on public.org_fees
  for each row execute function public.sync_org_fees_amount_columns();

-- Extends the existing amount-snapshot trigger to also lock amount_cents,
-- so both columns are set together at assignment creation and neither can
-- be changed afterward by editing the parent fee template.
create or replace function public.snapshot_org_fee_assignment_amount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.amount is not null and new.amount is distinct from old.amount then
    raise exception 'Organization fee assignment amount is immutable';
  end if;

  if tg_op = 'UPDATE' and old.amount_cents is not null and new.amount_cents is distinct from old.amount_cents then
    raise exception 'Organization fee assignment amount is immutable';
  end if;

  if new.amount is null then
    select coalesce(f.amount, f.amount_cents::numeric / 100)
      into new.amount
    from public.org_fees f
    where f.id = new.fee_id;
  end if;

  if new.amount_cents is null then
    new.amount_cents := round(new.amount * 100);
  end if;

  if new.amount is null or new.amount <= 0 then
    raise exception 'Organization fee assignment amount is required';
  end if;
  return new;
end;
$$;

drop trigger if exists org_fee_assignment_amount_snapshot on public.org_fee_assignments;
create trigger org_fee_assignment_amount_snapshot
before insert or update of amount, amount_cents on public.org_fee_assignments
for each row execute function public.snapshot_org_fee_assignment_amount();
