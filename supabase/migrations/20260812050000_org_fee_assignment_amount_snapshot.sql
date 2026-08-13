-- Preserve the amount owed at assignment time. Editing an org fee template
-- must never retroactively change pending or paid assignments.

alter table public.org_fees
  add column if not exists amount numeric(10,2),
  add column if not exists amount_cents integer;

alter table public.org_fee_assignments
  add column if not exists amount numeric(10,2);

update public.org_fee_assignments a
set amount = coalesce(f.amount, f.amount_cents::numeric / 100)
from public.org_fees f
where a.fee_id = f.id and a.amount is null;

create or replace function public.snapshot_org_fee_assignment_amount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.amount is not null and new.amount is distinct from old.amount then
    raise exception 'Organization fee assignment amount is immutable';
  end if;

  if new.amount is null then
    select coalesce(f.amount, f.amount_cents::numeric / 100)
      into new.amount
    from public.org_fees f
    where f.id = new.fee_id;
  end if;

  if new.amount is null or new.amount <= 0 then
    raise exception 'Organization fee assignment amount is required';
  end if;
  return new;
end;
$$;

drop trigger if exists org_fee_assignment_amount_snapshot on public.org_fee_assignments;
create trigger org_fee_assignment_amount_snapshot
before insert or update of amount on public.org_fee_assignments
for each row execute function public.snapshot_org_fee_assignment_amount();

-- Canonical cancellation spelling for native retry and web fulfillment.
update public.org_tryout_registrations set status = 'canceled' where status = 'cancelled';
alter table public.org_tryout_registrations drop constraint if exists org_tryout_registrations_status_check;
alter table public.org_tryout_registrations
  add constraint org_tryout_registrations_status_check
  check (status in ('pending', 'paid', 'canceled', 'waitlisted', 'expired'));
