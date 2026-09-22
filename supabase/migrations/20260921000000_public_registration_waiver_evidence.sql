alter table public.org_enrollment_submissions
  add column if not exists waiver_signed_at timestamptz,
  add column if not exists waiver_signer_name text;

comment on column public.org_enrollment_submissions.waiver_signed_at is
  'Timestamp when the public registration accepted every required waiver.';

comment on column public.org_enrollment_submissions.waiver_signer_name is
  'Full legal name typed by the person accepting the required waivers.';
