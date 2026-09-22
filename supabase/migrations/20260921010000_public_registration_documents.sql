alter table public.org_enrollment_forms
  add column if not exists required_documents jsonb not null default '[]'::jsonb;

create table if not exists public.org_enrollment_document_uploads (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.org_enrollment_forms(id) on delete cascade,
  submission_id uuid references public.org_enrollment_submissions(id) on delete cascade,
  requirement_id text not null,
  storage_path text not null unique,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  upload_token_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists org_enrollment_document_uploads_form_idx
  on public.org_enrollment_document_uploads(form_id, created_at desc);
create index if not exists org_enrollment_document_uploads_submission_idx
  on public.org_enrollment_document_uploads(submission_id);

alter table public.org_enrollment_document_uploads enable row level security;
revoke all on public.org_enrollment_document_uploads from anon, authenticated;
grant all on public.org_enrollment_document_uploads to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'registration-documents',
  'registration-documents',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
