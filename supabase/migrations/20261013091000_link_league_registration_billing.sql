-- Link the shared registration lifecycle to the existing Stripe-backed league
-- fee assignment ledger without introducing a second payment model.

alter table public.league_fee_assignments
  add column if not exists registration_id uuid references public.league_registrations(id) on delete cascade;

create unique index if not exists league_fee_assignment_registration_uidx
  on public.league_fee_assignments(registration_id)
  where registration_id is not null;

create or replace function public.sync_league_registration_fee_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.payment_status='not_required' or new.final_amount_cents=0 then
    update public.league_fee_assignments
      set amount_cents=0,status=case when paid_cents=0 then 'waived' else status end,updated_at=now()
      where registration_id=new.id and status in ('unpaid','partial');
  else
    update public.league_fee_assignments
      set amount_cents=new.final_amount_cents,updated_at=now()
      where registration_id=new.id and paid_cents=0 and status='unpaid';
  end if;
  return new;
end $$;

drop trigger if exists sync_league_registration_fee_assignment on public.league_registrations;
create trigger sync_league_registration_fee_assignment
after update of discount_amount_cents,payment_status on public.league_registrations
for each row execute function public.sync_league_registration_fee_assignment();

grant all on public.league_fee_assignments to service_role;
notify pgrst, 'reload schema';
