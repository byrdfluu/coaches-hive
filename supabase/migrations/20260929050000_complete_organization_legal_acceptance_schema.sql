-- Production checkout persists a versioned snapshot of every organization
-- agreement. Older environments may have the base table without these fields.
alter table if exists public.organization_legal_acceptances
  add column if not exists document_versions jsonb not null default '{}'::jsonb,
  add column if not exists document_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists app_version text;

-- Refresh PostgREST's schema cache immediately when this is run manually in
-- the Supabase SQL editor.
notify pgrst, 'reload schema';
