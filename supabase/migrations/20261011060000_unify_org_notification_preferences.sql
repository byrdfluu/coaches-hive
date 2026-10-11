-- Keep every organization notification surface on one durable contract.
-- Older portal screens used payment_reminders/roster_updates while the newer
-- native settings screen used new_payment_received/team_updates.

alter table public.org_notification_preferences
  add column if not exists weekly_digest boolean not null default false;

update public.org_notification_preferences
set payment_reminders = payment_reminders and new_payment_received,
    new_payment_received = payment_reminders and new_payment_received,
    roster_updates = roster_updates and team_updates,
    team_updates = roster_updates and team_updates;

create or replace function public.sync_org_notification_preference_aliases()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.payment_reminders := new.payment_reminders and new.new_payment_received;
    new.new_payment_received := new.payment_reminders;
    new.roster_updates := new.roster_updates and new.team_updates;
    new.team_updates := new.roster_updates;
  else
    if new.payment_reminders is distinct from old.payment_reminders
       and new.new_payment_received is not distinct from old.new_payment_received then
      new.new_payment_received := new.payment_reminders;
    elsif new.new_payment_received is distinct from old.new_payment_received
       and new.payment_reminders is not distinct from old.payment_reminders then
      new.payment_reminders := new.new_payment_received;
    elsif new.payment_reminders is distinct from new.new_payment_received then
      new.payment_reminders := new.payment_reminders and new.new_payment_received;
      new.new_payment_received := new.payment_reminders;
    end if;

    if new.roster_updates is distinct from old.roster_updates
       and new.team_updates is not distinct from old.team_updates then
      new.team_updates := new.roster_updates;
    elsif new.team_updates is distinct from old.team_updates
       and new.roster_updates is not distinct from old.roster_updates then
      new.roster_updates := new.team_updates;
    elsif new.roster_updates is distinct from new.team_updates then
      new.roster_updates := new.roster_updates and new.team_updates;
      new.team_updates := new.roster_updates;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sync_org_notification_preference_aliases
  on public.org_notification_preferences;
create trigger sync_org_notification_preference_aliases
before insert or update on public.org_notification_preferences
for each row execute function public.sync_org_notification_preference_aliases();

notify pgrst, 'reload schema';
