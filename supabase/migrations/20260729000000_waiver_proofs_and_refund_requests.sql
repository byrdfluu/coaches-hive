create extension if not exists pgcrypto;

-- Remove the abandoned guardian-role experiment. Athlete profile ownership is
-- the only supported family-account model.
alter table if exists public.profiles
  drop column if exists is_guardian,
  drop column if exists guardian_athlete_ids;

-- A signed waiver must remain readable even if the coach later edits or
-- deletes the reusable waiver template.
alter table public.coach_waiver_assignments
  add column if not exists signed_title_snapshot text,
  add column if not exists signed_body_snapshot text,
  add column if not exists signed_coach_name_snapshot text,
  add column if not exists signed_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists signature_hash text,
  add column if not exists signature_audit jsonb;

update public.coach_waiver_assignments a
set signed_title_snapshot = coalesce(a.signed_title_snapshot, w.title, 'Waiver'),
    signed_body_snapshot = coalesce(a.signed_body_snapshot, w.body, ''),
    signed_coach_name_snapshot = coalesce(
      a.signed_coach_name_snapshot,
      nullif(trim(p.full_name), ''),
      'Coach'
    ),
    signature_hash = coalesce(
      a.signature_hash,
      encode(digest(
        a.id::text || E'\n' ||
        coalesce(w.title, '') || E'\n' ||
        coalesce(w.body, '') || E'\n' ||
        coalesce(a.signature_name, '') || E'\n' ||
        coalesce(a.signed_at::text, ''),
        'sha256'
      ), 'hex')
    ),
    signature_audit = coalesce(
      a.signature_audit,
      jsonb_build_object(
        'version', 1,
        'algorithm', 'SHA-256',
        'assignment_id', a.id,
        'waiver_id', a.waiver_id,
        'athlete_profile_id', a.athlete_id,
        'signed_at', a.signed_at,
        'backfilled', true
      )
    )
from public.coach_waivers w
left join public.profiles p on p.id = w.coach_id
where a.waiver_id = w.id
  and a.status = 'signed';

create or replace function public.protect_signed_waiver_proof()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'signed' and (
    new.status is distinct from old.status or
    new.signed_at is distinct from old.signed_at or
    new.signature_name is distinct from old.signature_name or
    new.signed_title_snapshot is distinct from old.signed_title_snapshot or
    new.signed_body_snapshot is distinct from old.signed_body_snapshot or
    new.signed_coach_name_snapshot is distinct from old.signed_coach_name_snapshot or
    new.signed_by_user_id is distinct from old.signed_by_user_id or
    new.signature_hash is distinct from old.signature_hash or
    new.signature_audit is distinct from old.signature_audit
  ) then
    raise exception 'Signed waiver proof records are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_signed_waiver_proof_trigger
  on public.coach_waiver_assignments;
create trigger protect_signed_waiver_proof_trigger
before update on public.coach_waiver_assignments
for each row execute function public.protect_signed_waiver_proof();

create or replace function public.sign_coach_waiver_immutable(
  assignment_id uuid,
  signer_name text
)
returns public.coach_waiver_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_row public.coach_waiver_assignments%rowtype;
  waiver_row public.coach_waivers%rowtype;
  coach_name text;
  signed_time timestamptz := clock_timestamp();
  clean_signer text := nullif(trim(signer_name), '');
  proof_hash text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if clean_signer is null then raise exception 'Signer name is required'; end if;

  select a.* into assignment_row
  from public.coach_waiver_assignments a
  join public.athlete_profiles ap on ap.id = a.athlete_id
  where a.id = assignment_id and ap.owner_user_id = auth.uid()
  for update of a;
  if not found then raise exception 'Waiver assignment not found'; end if;

  if assignment_row.status = 'signed' then
    return assignment_row;
  end if;

  select * into waiver_row
  from public.coach_waivers
  where id = assignment_row.waiver_id;
  if not found then raise exception 'Waiver template not found'; end if;

  select coalesce(nullif(trim(full_name), ''), 'Coach') into coach_name
  from public.profiles where id = waiver_row.coach_id;
  coach_name := coalesce(coach_name, 'Coach');

  proof_hash := encode(digest(
    assignment_row.id::text || E'\n' ||
    coalesce(waiver_row.title, '') || E'\n' ||
    coalesce(waiver_row.body, '') || E'\n' ||
    clean_signer || E'\n' ||
    signed_time::text,
    'sha256'
  ), 'hex');

  update public.coach_waiver_assignments
  set status = 'signed',
      signed_at = signed_time,
      signature_name = clean_signer,
      signed_title_snapshot = coalesce(waiver_row.title, 'Waiver'),
      signed_body_snapshot = coalesce(waiver_row.body, ''),
      signed_coach_name_snapshot = coach_name,
      signed_by_user_id = auth.uid(),
      signature_hash = proof_hash,
      signature_audit = jsonb_build_object(
        'version', 1,
        'algorithm', 'SHA-256',
        'assignment_id', assignment_row.id,
        'waiver_id', assignment_row.waiver_id,
        'athlete_profile_id', assignment_row.athlete_id,
        'signed_by_user_id', auth.uid(),
        'signed_at', signed_time
      ),
      updated_at = signed_time
  where id = assignment_row.id
  returning * into assignment_row;

  return assignment_row;
end;
$$;

revoke all on function public.sign_coach_waiver_immutable(uuid, text) from public, anon;
grant execute on function public.sign_coach_waiver_immutable(uuid, text) to authenticated;

create table if not exists public.payment_refund_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid references public.athlete_profiles(id) on delete set null,
  payment_type text not null check (payment_type in ('org_fee', 'coach_fee', 'marketplace_order')),
  payment_record_id uuid not null,
  amount numeric(10, 2) not null check (amount > 0),
  reason text not null check (char_length(trim(reason)) between 10 and 1000),
  status text not null default 'requested'
    check (status in ('requested', 'under_review', 'approved', 'rejected', 'processing', 'refunded', 'failed', 'canceled')),
  stripe_refund_id text,
  resolution_note text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_refund_requests_active_payment_uidx
  on public.payment_refund_requests(requester_id, payment_type, payment_record_id)
  where status in ('requested', 'under_review', 'approved', 'processing');

create index if not exists payment_refund_requests_requester_date_idx
  on public.payment_refund_requests(requester_id, requested_at desc);

alter table public.payment_refund_requests enable row level security;

drop policy if exists "refund_requester_read_own" on public.payment_refund_requests;
create policy "refund_requester_read_own"
  on public.payment_refund_requests for select
  using (requester_id = auth.uid());

create or replace function public.request_payment_refund(
  payment_type text,
  payment_record_id uuid,
  reason text
)
returns public.payment_refund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.payment_refund_requests%rowtype;
  athlete_profile_id uuid;
  payment_amount numeric(10, 2);
  payment_state text;
  clean_reason text := nullif(trim(reason), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if clean_reason is null or char_length(clean_reason) < 10 then
    raise exception 'Please provide at least 10 characters explaining the refund request';
  end if;

  if payment_type = 'org_fee' then
    select a.athlete_id, a.amount, a.status
      into athlete_profile_id, payment_amount, payment_state
    from public.org_fee_assignments a
    join public.athlete_profiles ap on ap.id = a.athlete_id
    where a.id = payment_record_id and ap.owner_user_id = auth.uid();
  elsif payment_type = 'coach_fee' then
    select a.athlete_id, a.amount, a.status
      into athlete_profile_id, payment_amount, payment_state
    from public.coach_fee_assignments a
    join public.athlete_profiles ap on ap.id = a.athlete_id
    where a.id = payment_record_id and ap.owner_user_id = auth.uid();
  elsif payment_type = 'marketplace_order' then
    select null::uuid, coalesce(o.total_amount, o.amount), coalesce(o.payment_status, o.status)
      into athlete_profile_id, payment_amount, payment_state
    from public.marketplace_orders o
    where o.id = payment_record_id and o.buyer_id = auth.uid();
  else
    raise exception 'Unsupported payment type';
  end if;

  if payment_amount is null then raise exception 'Eligible payment not found'; end if;
  if payment_state not in ('paid', 'disputed') then
    raise exception 'Only completed payments can be submitted for refund review';
  end if;

  insert into public.payment_refund_requests(
    requester_id, athlete_id, payment_type, payment_record_id, amount, reason
  ) values (
    auth.uid(), athlete_profile_id, payment_type, payment_record_id, payment_amount, clean_reason
  )
  returning * into request_row;

  return request_row;
exception
  when unique_violation then
    raise exception 'A refund request is already active for this payment';
end;
$$;

revoke all on function public.request_payment_refund(text, uuid, text) from public, anon;
grant execute on function public.request_payment_refund(text, uuid, text) to authenticated;

-- Requests do not change payment state. A trusted web worker must create the
-- Stripe refund, then write the Stripe-confirmed status and refund ID.
revoke insert, update, delete on public.payment_refund_requests from authenticated;
grant select on public.payment_refund_requests to authenticated;
