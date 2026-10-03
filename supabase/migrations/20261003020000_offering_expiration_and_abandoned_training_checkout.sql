begin;

alter table public.programs add column if not exists archived_at timestamptz;
alter table public.org_tryouts add column if not exists archived_at timestamptz;
alter table public.sessions add column if not exists archived_at timestamptz;
alter table public.org_training_package_purchases add column if not exists superseded_at timestamptz;

create or replace function public.archive_expired_family_offerings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_programs integer := 0;
  v_tryouts integer := 0;
  v_sessions integer := 0;
  v_training_purchases integer := 0;
begin
  update public.programs
  set archived_at = now()
  where archived_at is null
    and coalesce(end_date, start_date) is not null
    and coalesce(end_date, start_date) < current_date;
  get diagnostics v_programs = row_count;

  update public.org_tryouts
  set archived_at = now()
  where archived_at is null
    and tryout_date is not null
    and tryout_date::date < current_date;
  get diagnostics v_tryouts = row_count;

  update public.sessions
  set archived_at = now()
  where archived_at is null
    and coalesce(end_time, start_time) < now();
  get diagnostics v_sessions = row_count;

  -- A pending purchase with no Stripe object is not a financial record or an
  -- entitlement. Supersede old abandoned rows so they cannot masquerade as a
  -- purchased plan; a subsequent request creates a fresh authoritative row.
  update public.org_training_package_purchases
  set superseded_at = now(), updated_at = now()
  where status = 'pending'
    and superseded_at is null
    and stripe_checkout_session_id is null
    and stripe_subscription_id is null
    and created_at < now() - interval '30 minutes';
  get diagnostics v_training_purchases = row_count;

  return jsonb_build_object(
    'programs', v_programs,
    'tryouts', v_tryouts,
    'sessions', v_sessions,
    'abandoned_training_purchases', v_training_purchases
  );
end;
$$;

revoke all on function public.archive_expired_family_offerings() from public, anon, authenticated;
grant execute on function public.archive_expired_family_offerings() to service_role;

create or replace function public.enforce_program_republish_date()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status = 'active' and (
    (coalesce(new.end_date, new.start_date) is null and new.archived_at is not null)
    or (coalesce(new.end_date, new.start_date) is not null and coalesce(new.end_date, new.start_date) < current_date)
  ) then
    raise exception 'A current or future program date is required before publishing';
  end if;
  if new.status = 'active' and coalesce(new.end_date, new.start_date) >= current_date then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists programs_require_current_date on public.programs;
create trigger programs_require_current_date
before insert or update of status,start_date,end_date on public.programs
for each row execute function public.enforce_program_republish_date();

create or replace function public.enforce_tryout_republish_date()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status in ('open','published','active') and (
    (new.tryout_date is null and new.archived_at is not null)
    or (new.tryout_date is not null and new.tryout_date::date < current_date)
  ) then
    raise exception 'A current or future tryout date is required before publishing';
  end if;
  if new.status in ('open','published','active') and new.tryout_date::date >= current_date then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists org_tryouts_require_current_date on public.org_tryouts;
create trigger org_tryouts_require_current_date
before insert or update of status,tryout_date on public.org_tryouts
for each row execute function public.enforce_tryout_republish_date();

create or replace function public.enforce_session_republish_date()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status in ('available','open','scheduled') and (
    (coalesce(new.end_time, new.start_time) is null and new.archived_at is not null)
    or coalesce(new.end_time, new.start_time) < now()
  ) then
    raise exception 'A current or future session date is required before publishing';
  end if;
  if new.status in ('available','open','scheduled') and coalesce(new.end_time, new.start_time) >= now() then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_require_current_date on public.sessions;
create trigger sessions_require_current_date
before insert or update of status,start_time,end_time on public.sessions
for each row execute function public.enforce_session_republish_date();

select public.archive_expired_family_offerings();
notify pgrst, 'reload schema';

commit;
