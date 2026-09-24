-- Durable clickwrap evidence for public under-13 registrations.
alter table public.org_enrollment_submissions
  add column if not exists coppa_guardian_identity_confirmed boolean not null default false,
  add column if not exists coppa_notice_version text,
  add column if not exists coppa_consent_method text,
  add column if not exists coppa_confirmation_text jsonb,
  add column if not exists coppa_consent_ip text,
  add column if not exists coppa_consent_user_agent text;

alter table public.organization_legal_acceptances
  add column if not exists document_versions jsonb not null default '{}'::jsonb,
  add column if not exists document_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists app_version text;
