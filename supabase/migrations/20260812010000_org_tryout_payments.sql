-- Payment support for tryouts: a price on org_tryouts, a registration table
-- mirroring program_registrations, and matching RLS/completion plumbing.

alter table public.org_tryouts
  add column if not exists price numeric(10,2);

create table if not exists public.org_tryout_registrations (
  id                    uuid default gen_random_uuid() primary key,
  tryout_id             uuid not null references public.org_tryouts(id) on delete cascade,
  athlete_profile_id    uuid not null references public.athlete_profiles(id) on delete cascade,
  owner_user_id         uuid not null references public.profiles(id) on delete cascade,
  status                text default 'pending' check (status in ('pending', 'paid', 'canceled', 'waitlisted', 'expired')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  registered_at         timestamptz default now(),
  unique(tryout_id, athlete_profile_id)
);

alter table public.org_tryout_registrations enable row level security;

-- Athletes/org members can read open tryouts (mirrors programs' read_active_programs).
drop policy if exists read_open_tryouts on public.org_tryouts;
create policy read_open_tryouts on public.org_tryouts for select
  using (status != 'draft' or org_id in (
    select org_id from public.organization_memberships
    where user_id = auth.uid() and role in ('owner','admin','coach')
  ));

create policy "athletes_read_own_tryout_registrations" on public.org_tryout_registrations for select
  using (owner_user_id = auth.uid());

create policy "athletes_insert_tryout_registrations" on public.org_tryout_registrations for insert
  with check (owner_user_id = auth.uid());

create policy "athletes_update_own_tryout_registrations" on public.org_tryout_registrations for update
  using (owner_user_id = auth.uid());

create policy "org_admins_manage_tryout_registrations" on public.org_tryout_registrations for all
  using (tryout_id in (
    select id from public.org_tryouts where org_id in (
      select org_id from public.organization_memberships
      where user_id = auth.uid() and role in ('owner','admin','coach')
    )
  ));

-- Webhook-callable: mark a tryout registration as paid after Stripe checkout.
-- Mirrors complete_program_registration().
create or replace function public.complete_tryout_registration(
  registration_id uuid,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text default null,
  paid_amount numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reg_row    public.org_tryout_registrations%rowtype;
  tryout_row public.org_tryouts%rowtype;
begin
  if nullif(trim(stripe_checkout_session_id), '') is null then
    raise exception 'Stripe Checkout Session ID is required';
  end if;

  select * into reg_row
  from public.org_tryout_registrations
  where id = registration_id
  for update;
  if not found then raise exception 'Tryout registration not found'; end if;

  if reg_row.status = 'paid' then
    if reg_row.stripe_checkout_session_id = complete_tryout_registration.stripe_checkout_session_id then
      return;
    end if;
    raise exception 'Registration was paid by a different Checkout Session';
  end if;

  select * into tryout_row from public.org_tryouts where id = reg_row.tryout_id;
  if found and tryout_row.price is not null then
    if paid_amount is null or round(paid_amount, 2) <> round(tryout_row.price, 2) then
      raise exception 'Paid amount does not match tryout price';
    end if;
  end if;

  update public.org_tryout_registrations
  set status                     = 'paid',
      registered_at              = now(),
      stripe_checkout_session_id = complete_tryout_registration.stripe_checkout_session_id,
      stripe_payment_intent_id   = complete_tryout_registration.stripe_payment_intent_id
  where id = registration_id;

  perform public.notify_user(
    reg_row.owner_user_id,
    'Registration confirmed',
    'Your registration for ' || coalesce(tryout_row.title, 'the tryout') || ' has been confirmed.',
    'tryout_registration',
    registration_id
  );
end;
$$;

revoke all on function public.complete_tryout_registration(uuid, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.complete_tryout_registration(uuid, text, text, numeric)
  to service_role;

-- Standardize the native/web spelling while safely upgrading older rows.
update public.org_tryout_registrations set status = 'canceled' where status = 'cancelled';
alter table public.org_tryout_registrations drop constraint if exists org_tryout_registrations_status_check;
alter table public.org_tryout_registrations
  add constraint org_tryout_registrations_status_check
  check (status in ('pending', 'paid', 'canceled', 'waitlisted', 'expired'));
