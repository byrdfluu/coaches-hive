alter table if exists public.tryout_registrations
  add column if not exists stripe_payment_intent_id text,
  add column if not exists payment_receipt_id uuid references public.payment_receipts(id) on delete set null,
  add column if not exists paid_at timestamptz;

create unique index if not exists tryout_registrations_payment_intent_unique
  on public.tryout_registrations (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists tryout_registrations_payment_receipt_idx
  on public.tryout_registrations(payment_receipt_id);

alter table if exists public.org_enrollment_forms
  add column if not exists enrollment_fee_cents integer not null default 0;

alter table if exists public.org_enrollment_submissions
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists stripe_payment_intent_id text,
  add column if not exists payment_receipt_id uuid references public.payment_receipts(id) on delete set null,
  add column if not exists paid_at timestamptz;

create unique index if not exists org_enrollment_submissions_payment_intent_unique
  on public.org_enrollment_submissions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists org_enrollment_submissions_payment_receipt_idx
  on public.org_enrollment_submissions(payment_receipt_id);
