-- Organization settings fields used by org settings and org portal flows.
-- Safe to run multiple times.

alter table if exists public.org_settings
  add column if not exists org_name text,
  add column if not exists org_type text,
  add column if not exists primary_contact_email text,
  add column if not exists support_phone text,
  add column if not exists location text,
  add column if not exists cancellation_window text,
  add column if not exists reschedule_window text,
  add column if not exists policy_notes text,
  add column if not exists org_refund_policy text,
  add column if not exists billing_contact text,
  add column if not exists invoice_frequency text,
  add column if not exists tax_id text,
  add column if not exists billing_address text,
  add column if not exists guardian_consent text,
  add column if not exists eligibility_tracking text,
  add column if not exists medical_clearance text,
  add column if not exists communication_limits text,
  add column if not exists fee_reminder_policy text,
  add column if not exists plan text default 'standard',
  add column if not exists plan_status text default 'trialing',
  add column if not exists season_start date,
  add column if not exists season_end date,
  add column if not exists brand_logo_url text,
  add column if not exists brand_cover_url text,
  add column if not exists brand_primary_color text,
  add column if not exists brand_accent_color text,
  add column if not exists stripe_account_id text,
  add column if not exists portal_preferences jsonb default '{}'::jsonb,
  add column if not exists compliance_checklist jsonb default '{}'::jsonb;

alter table if exists public.organizations
  add column if not exists name text,
  add column if not exists org_type text;
