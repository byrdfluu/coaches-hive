-- Persist durable league document metadata so web and iOS can render and
-- clean the same private objects without storing expiring signed URLs.

alter table public.league_documents
  add column if not exists storage_filename text,
  add column if not exists storage_mime_type text,
  add column if not exists storage_size_bytes bigint,
  add column if not exists storage_sha256 text;

alter table public.league_document_submissions
  add column if not exists storage_filename text,
  add column if not exists storage_mime_type text,
  add column if not exists storage_size_bytes bigint,
  add column if not exists storage_sha256 text;

alter table public.league_documents
  drop constraint if exists league_documents_storage_size_check;
alter table public.league_documents
  add constraint league_documents_storage_size_check
  check (storage_size_bytes is null or storage_size_bytes between 1 and 20971520);

alter table public.league_document_submissions
  drop constraint if exists league_document_submissions_storage_size_check;
alter table public.league_document_submissions
  add constraint league_document_submissions_storage_size_check
  check (storage_size_bytes is null or storage_size_bytes between 1 and 20971520);

notify pgrst, 'reload schema';
