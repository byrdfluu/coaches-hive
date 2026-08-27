-- Auditable off-session consent, fixed payment destination, and SCA recovery.
alter table public.family_payment_plan_enrollments
  add column if not exists stripe_connected_account_id text,
  add column if not exists autopay_consent_confirmed_at timestamptz,
  add column if not exists autopay_consent_checkout_session_id text,
  add column if not exists autopay_consent_text text,
  add column if not exists autopay_consent_user_agent text,
  add column if not exists autopay_consent_ip_hash text;

alter table public.family_payment_plan_installments
  drop constraint if exists family_payment_plan_installments_status_check;
alter table public.family_payment_plan_installments
  add constraint family_payment_plan_installments_status_check check (
    status in ('scheduled','pending','processing','paid','failed','past_due','requires_action','waived','refunded','canceled')
  );

create unique index if not exists family_payment_plan_consent_session_key
  on public.family_payment_plan_enrollments(autopay_consent_checkout_session_id)
  where autopay_consent_checkout_session_id is not null;

notify pgrst, 'reload schema';
