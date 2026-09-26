alter table public.org_invites
  add column if not exists workspace_id uuid references public.business_workspaces(id) on delete cascade,
  add column if not exists invitation_code_hash text;

create index if not exists org_invites_workspace_idx
  on public.org_invites(workspace_id, created_at desc);

create unique index if not exists org_invites_pending_code_hash_uidx
  on public.org_invites(invitation_code_hash)
  where invitation_code_hash is not null and status='pending';
