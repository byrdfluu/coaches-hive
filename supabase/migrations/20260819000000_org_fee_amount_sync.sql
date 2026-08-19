-- Web writes amount_cents (drives the actual Stripe charge); iOS's fee editor
-- only writes the decimal amount column. With no sync between them, an edit
-- on one client silently stops showing on the other, and iOS can display a
-- fee amount that no longer matches what will actually be charged.
--
-- Reconcile existing drift using amount_cents as the source of truth (it's
-- what Stripe already charges), then keep both columns in sync going forward
-- regardless of which client writes which column.

update public.org_fees
set amount = round(amount_cents::numeric / 100, 2)
where amount_cents is not null
  and (amount is null or round(amount_cents::numeric / 100, 2) <> amount);

update public.org_fee_assignments
set amount = round(amount_cents::numeric / 100, 2)
where amount_cents is not null
  and (amount is null or round(amount_cents::numeric / 100, 2) <> amount);

create or replace function public.sync_org_fee_amount_columns()
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
  for each row execute function public.sync_org_fee_amount_columns();

drop trigger if exists sync_org_fee_assignments_amount on public.org_fee_assignments;
create trigger sync_org_fee_assignments_amount
  before insert or update on public.org_fee_assignments
  for each row execute function public.sync_org_fee_amount_columns();
