-- Reconcile league document files and immutable signatures across web and iOS.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'league-documents', 'league-documents', false, 20971520,
  array['application/pdf','image/jpeg','image/png','image/heic','image/heif','text/plain','application/rtf','application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.league_document_signatures (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  document_id uuid not null references public.league_documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  signer_name text not null check (length(trim(signer_name)) between 2 and 200),
  signer_capacity text not null check (signer_capacity in ('athlete_or_guardian','coach','organization_representative','league_representative','authorized_representative')),
  authority_attested boolean not null check (authority_attested),
  consent_attested boolean not null check (consent_attested),
  consent_version text not null,
  document_title_snapshot text not null,
  document_storage_path_snapshot text not null,
  signed_at timestamptz not null default now(),
  client_platform text,
  client_app_version text,
  signature_hash text not null,
  audit jsonb not null default '{}'::jsonb,
  unique(document_id, user_id)
);

create index if not exists league_document_signatures_league_idx on public.league_document_signatures(league_id, signed_at desc);
create index if not exists league_document_signatures_user_idx on public.league_document_signatures(user_id, signed_at desc);
alter table public.league_document_signatures enable row level security;

-- The original league context helper only recognized league staff, organization
-- members, and athlete profile owners. Keep direct iOS reads and private Storage
-- access aligned with the account/profile relationships accepted by web APIs.
create or replace function public.user_has_league_context(p_league_id uuid,p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_league_member(p_league_id,p_user_id)
 or exists(
  select 1 from public.league_organizations lo join public.organization_memberships om on om.org_id=lo.org_id
  where lo.league_id=p_league_id and lo.status='active' and om.user_id=p_user_id and om.status='active')
 or exists(
  select 1 from public.league_team_assignments lta join public.org_teams ot on ot.id=lta.team_id
  where lta.league_id=p_league_id and lta.status='active' and (
    ot.coach_id=p_user_id or exists(select 1 from public.org_team_coaches otc where otc.team_id=ot.id and otc.coach_id=p_user_id)))
 or exists(
  select 1 from public.league_registrations lr join public.athlete_profiles ap on ap.id=lr.athlete_id
  where lr.league_id=p_league_id and lr.status<>'withdrawn' and (
    ap.owner_user_id=p_user_id or ap.auth_user_id=p_user_id
    or exists(select 1 from public.family_subscription_athletes fsa where fsa.athlete_profile_id=ap.id and fsa.subscription_owner_id=p_user_id)
    or exists(select 1 from public.guardian_privacy_consents gpc where gpc.athlete_id=ap.id and gpc.guardian_user_id=p_user_id
      and gpc.guardian_identity_confirmed and gpc.coppa_consent_given)));
$$;
revoke all on function public.user_has_league_context(uuid,uuid) from public,anon;
grant execute on function public.user_has_league_context(uuid,uuid) to authenticated;

drop policy if exists league_document_signatures_read on public.league_document_signatures;
create policy league_document_signatures_read on public.league_document_signatures
for select to authenticated using (
  user_id = auth.uid()
  or public.is_league_admin(league_id, auth.uid())
  or public.league_has_permission(league_id, 'manage_documents', auth.uid())
  or public.is_admin(auth.uid())
);

create or replace function public.sign_league_document(
  p_document_id uuid,
  p_signer_name text,
  p_signer_capacity text,
  p_authority_attested boolean,
  p_consent_attested boolean,
  p_consent_version text,
  p_client_platform text default null,
  p_client_app_version text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_document public.league_documents%rowtype;
  v_id uuid := gen_random_uuid();
  v_signed_at timestamptz := now();
  v_hash text;
  v_authorized boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not coalesce(p_authority_attested, false) or not coalesce(p_consent_attested, false) then raise exception 'Signature attestations are required'; end if;
  if length(trim(coalesce(p_signer_name, ''))) < 2 then raise exception 'Full legal name is required'; end if;
  if p_signer_capacity not in ('athlete_or_guardian','coach','organization_representative','league_representative') then raise exception 'Invalid signer capacity'; end if;

  select * into v_document from public.league_documents where id = p_document_id;
  if not found then raise exception 'League document not found'; end if;
  if v_document.storage_path is null or trim(v_document.storage_path) = '' then raise exception 'The document file must be uploaded before it can be signed'; end if;

  if p_signer_capacity = 'athlete_or_guardian' and v_document.target_type = 'athlete' then
    select exists(
      select 1 from public.league_registrations lr
      join public.athlete_profiles ap on ap.id = lr.athlete_id
      where lr.league_id = v_document.league_id and lr.status <> 'withdrawn' and (
        ap.owner_user_id = auth.uid() or ap.auth_user_id = auth.uid()
        or exists(select 1 from public.family_subscription_athletes fsa where fsa.athlete_profile_id = ap.id and fsa.subscription_owner_id = auth.uid())
        or exists(select 1 from public.guardian_privacy_consents gpc where gpc.athlete_id = ap.id and gpc.guardian_user_id = auth.uid()
          and gpc.guardian_identity_confirmed and gpc.coppa_consent_given)
      )
    ) into v_authorized;
  elsif p_signer_capacity = 'coach' and v_document.target_type in ('coach','team') then
    select exists(
      select 1 from public.league_team_assignments lta
      join public.org_teams ot on ot.id = lta.team_id
      where lta.league_id = v_document.league_id and lta.status = 'active'
        and (ot.coach_id = auth.uid() or exists(
          select 1 from public.org_team_coaches otc where otc.team_id = ot.id and otc.coach_id = auth.uid()
        ))
    ) or exists(
      select 1 from public.league_memberships lm
      where lm.league_id = v_document.league_id and lm.user_id = auth.uid() and lm.status = 'active' and lm.role = 'coach'
    ) into v_authorized;
  elsif p_signer_capacity = 'organization_representative' and v_document.target_type in ('organization','team') then
    select exists(
      select 1 from public.league_organizations lo
      join public.organization_memberships om on om.org_id = lo.org_id
      where lo.league_id = v_document.league_id and lo.status = 'active'
        and om.user_id = auth.uid() and om.status = 'active'
    ) into v_authorized;
  elsif p_signer_capacity = 'league_representative' then
    v_authorized := public.is_league_admin(v_document.league_id, auth.uid())
      or public.league_has_permission(v_document.league_id, 'manage_documents', auth.uid())
      or public.is_admin(auth.uid());
  end if;
  if not v_authorized then raise exception 'You are not authorized to sign this league document'; end if;

  v_hash := encode(digest(concat_ws('|', v_id::text, v_document.id::text, auth.uid()::text, trim(p_signer_name), p_signer_capacity,
    v_document.title, v_document.storage_path, v_signed_at::text, p_consent_version), 'sha256'), 'hex');

  insert into public.league_document_signatures (
    id, league_id, document_id, user_id, signer_name, signer_capacity, authority_attested, consent_attested,
    consent_version, document_title_snapshot, document_storage_path_snapshot, signed_at,
    client_platform, client_app_version, signature_hash, audit
  ) values (
    v_id, v_document.league_id, v_document.id, auth.uid(), trim(p_signer_name), p_signer_capacity, true, true,
    p_consent_version, v_document.title, v_document.storage_path, v_signed_at,
    p_client_platform, p_client_app_version, v_hash,
    jsonb_build_object('version', 1, 'user_id', auth.uid(), 'signed_at', v_signed_at, 'consent_version', p_consent_version)
  );

  insert into public.league_audit_events (league_id, actor_user_id, event_type, record_type, record_id, metadata)
  values (v_document.league_id, auth.uid(), 'league_document_signed', 'league_document_signature', v_id,
    jsonb_build_object('document_id', v_document.id, 'signer_capacity', p_signer_capacity, 'signature_hash', v_hash));
  return v_id;
end;
$$;

revoke all on function public.sign_league_document(uuid,text,text,boolean,boolean,text,text,text) from public;
grant execute on function public.sign_league_document(uuid,text,text,boolean,boolean,text,text,text) to authenticated;
revoke insert, update, delete on public.league_document_signatures from authenticated;

drop policy if exists league_document_files_insert on storage.objects;
create policy league_document_files_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'league-documents' and auth.uid() is not null and (
    public.is_league_admin(((storage.foldername(name))[1])::uuid, auth.uid())
    or public.league_has_permission(((storage.foldername(name))[1])::uuid, 'manage_documents', auth.uid())
  )
);

drop policy if exists league_document_files_read on storage.objects;
create policy league_document_files_read on storage.objects for select to authenticated
using (
  bucket_id = 'league-documents' and auth.uid() is not null
  and public.user_has_league_context(((storage.foldername(name))[1])::uuid)
);

drop policy if exists league_document_files_delete on storage.objects;
create policy league_document_files_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'league-documents' and auth.uid() is not null and (
    public.is_league_admin(((storage.foldername(name))[1])::uuid, auth.uid())
    or public.league_has_permission(((storage.foldername(name))[1])::uuid, 'manage_documents', auth.uid())
  )
);

notify pgrst, 'reload schema';
