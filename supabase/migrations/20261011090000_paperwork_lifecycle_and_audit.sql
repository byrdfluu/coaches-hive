-- End-to-end paperwork lifecycle for youth-sports records. Safe to rerun.
create extension if not exists pgcrypto;

alter table public.org_documents
  add column if not exists version_number integer not null default 1 check (version_number > 0),
  add column if not exists lifecycle_status text not null default 'published'
    check (lifecycle_status in ('draft', 'published', 'superseded', 'archived')),
  add column if not exists effective_at timestamptz,
  add column if not exists due_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists season_label text,
  add column if not exists supersedes_id uuid references public.org_documents(id) on delete restrict,
  add column if not exists archived_at timestamptz;

alter table public.coach_waivers
  add column if not exists storage_path text,
  add column if not exists file_sha256 text,
  add column if not exists version_number integer not null default 1 check (version_number > 0),
  add column if not exists lifecycle_status text not null default 'published'
    check (lifecycle_status in ('draft', 'published', 'superseded', 'archived')),
  add column if not exists effective_at timestamptz,
  add column if not exists due_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists season_label text,
  add column if not exists supersedes_id uuid references public.coach_waivers(id) on delete restrict,
  add column if not exists archived_at timestamptz;

alter table public.org_document_completions
  add column if not exists signer_relationship text,
  add column if not exists signer_authority_attested boolean not null default false,
  add column if not exists electronic_consent_attested boolean not null default false,
  add column if not exists consent_version text,
  add column if not exists client_platform text,
  add column if not exists client_app_version text,
  add column if not exists signed_pdf_storage_path text,
  add column if not exists signed_pdf_sha256 text,
  add column if not exists proof_generated_at timestamptz;

alter table public.coach_waiver_assignments
  add column if not exists signer_relationship text,
  add column if not exists signer_authority_attested boolean not null default false,
  add column if not exists electronic_consent_attested boolean not null default false,
  add column if not exists consent_version text,
  add column if not exists client_platform text,
  add column if not exists client_app_version text,
  add column if not exists signed_storage_path_snapshot text,
  add column if not exists signed_file_sha256_snapshot text,
  add column if not exists signed_pdf_storage_path text,
  add column if not exists signed_pdf_sha256 text,
  add column if not exists proof_generated_at timestamptz;

create table if not exists public.coach_waiver_targets (
  id uuid primary key default gen_random_uuid(),
  waiver_id uuid not null references public.coach_waivers(id) on delete cascade,
  target_type text not null check (target_type in ('all_managed', 'team', 'athlete')),
  team_id uuid references public.org_teams(id) on delete cascade,
  athlete_id uuid references public.athlete_profiles(id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (target_type = 'all_managed' and team_id is null and athlete_id is null) or
    (target_type = 'team' and team_id is not null and athlete_id is null) or
    (target_type = 'athlete' and athlete_id is not null and team_id is null)
  )
);
create unique index if not exists coach_waiver_targets_all_uidx
  on public.coach_waiver_targets(waiver_id) where target_type = 'all_managed';
create unique index if not exists coach_waiver_targets_team_uidx
  on public.coach_waiver_targets(waiver_id, team_id) where target_type = 'team';
create unique index if not exists coach_waiver_targets_athlete_uidx
  on public.coach_waiver_targets(waiver_id, athlete_id) where target_type = 'athlete';
alter table public.coach_waiver_targets enable row level security;
drop policy if exists coach_waiver_targets_owner_all on public.coach_waiver_targets;
create policy coach_waiver_targets_owner_all on public.coach_waiver_targets for all
  using (exists (select 1 from public.coach_waivers w where w.id = waiver_id and w.coach_id = auth.uid()))
  with check (exists (select 1 from public.coach_waivers w where w.id = waiver_id and w.coach_id = auth.uid()));

create table if not exists public.paperwork_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  record_type text not null check (record_type in ('org_document', 'coach_waiver')),
  record_id uuid not null,
  athlete_id uuid references public.athlete_profiles(id) on delete set null,
  event_type text not null check (event_type in
    ('created','published','assigned','viewed','signed','proof_generated','proof_downloaded','reminder_sent','archived','exported')),
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
create index if not exists paperwork_audit_record_idx
  on public.paperwork_audit_events(record_type, record_id, occurred_at desc);
alter table public.paperwork_audit_events enable row level security;
drop policy if exists paperwork_audit_actor_read on public.paperwork_audit_events;
create policy paperwork_audit_actor_read on public.paperwork_audit_events for select
  using (actor_user_id = auth.uid() or public.is_admin(auth.uid()));

create or replace function public.record_paperwork_event(
  p_record_type text, p_record_id uuid, p_event_type text,
  p_athlete_id uuid default null, p_metadata jsonb default '{}'
) returns uuid language plpgsql security definer set search_path = public as $$
declare event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_record_type = 'org_document' and not exists (
    select 1 from public.org_documents d where d.id = p_record_id and
      (public.is_org_director(d.org_id) or (p_athlete_id is not null and public.owns_athlete_profile(p_athlete_id) and public.is_org_document_assigned(d.id,p_athlete_id)))
  ) then raise exception 'Document access denied'; end if;
  if p_record_type = 'coach_waiver' and not exists (
    select 1 from public.coach_waivers w left join public.coach_waiver_assignments a on a.waiver_id=w.id
    where w.id=p_record_id and (w.coach_id=auth.uid() or (a.athlete_id=p_athlete_id and public.owns_athlete_profile(a.athlete_id)))
  ) then raise exception 'Waiver access denied'; end if;
  insert into public.paperwork_audit_events(actor_user_id,record_type,record_id,athlete_id,event_type,metadata)
  values(auth.uid(),p_record_type,p_record_id,p_athlete_id,p_event_type,coalesce(p_metadata,'{}')) returning id into event_id;
  return event_id;
end $$;
revoke all on function public.record_paperwork_event(text,uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.record_paperwork_event(text,uuid,text,uuid,jsonb) to authenticated;

-- New signatures require explicit legal authority and e-sign consent. Existing
-- two-argument RPCs remain available only for old app versions.
create or replace function public.sign_coach_waiver_with_authority(
  p_assignment_id uuid, p_signer_name text, p_signer_relationship text,
  p_authority_attested boolean, p_consent_attested boolean,
  p_consent_version text default '2026-08-08', p_client_platform text default 'ios',
  p_client_app_version text default null
) returns public.coach_waiver_assignments language plpgsql security definer set search_path=public as $$
declare r public.coach_waiver_assignments%rowtype; w public.coach_waivers%rowtype; signed_time timestamptz:=clock_timestamp(); proof_hash text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_signer_name),'') is null then raise exception 'Signer name is required'; end if;
  if p_signer_relationship not in ('parent','legal_guardian','adult_athlete','authorized_representative') then raise exception 'Select the signer relationship'; end if;
  if not coalesce(p_authority_attested,false) then raise exception 'You must confirm authority to sign'; end if;
  if not coalesce(p_consent_attested,false) then raise exception 'You must consent to electronic records and signatures'; end if;
  select a.* into r from public.coach_waiver_assignments a join public.athlete_profiles ap on ap.id=a.athlete_id
    where a.id=p_assignment_id and ap.owner_user_id=auth.uid() for update of a;
  if not found then raise exception 'Waiver assignment not found'; end if;
  if r.status='signed' then return r; end if;
  select * into w from public.coach_waivers where id=r.waiver_id and lifecycle_status='published'
    and (effective_at is null or effective_at<=now()) and (expires_at is null or expires_at>now());
  if not found then raise exception 'This waiver is not currently available for signature'; end if;
  proof_hash:=encode(extensions.digest(r.id::text||E'\n'||coalesce(w.title,'')||E'\n'||coalesce(w.body,'')||E'\n'||trim(p_signer_name)||E'\n'||p_signer_relationship||E'\n'||signed_time::text,'sha256'),'hex');
  update public.coach_waiver_assignments set status='signed',signed_at=signed_time,signature_name=trim(p_signer_name),
    signed_title_snapshot=coalesce(w.title,'Waiver'),signed_body_snapshot=coalesce(w.body,''),
    signed_coach_name_snapshot=coalesce((select nullif(trim(full_name),'') from public.profiles where id=w.coach_id),'Coach'),
    signed_storage_path_snapshot=w.storage_path,signed_file_sha256_snapshot=w.file_sha256,signed_by_user_id=auth.uid(),signature_hash=proof_hash,
    signer_relationship=p_signer_relationship,signer_authority_attested=true,electronic_consent_attested=true,
    consent_version=p_consent_version,client_platform=p_client_platform,client_app_version=p_client_app_version,
    signature_audit=jsonb_build_object('version',2,'algorithm','SHA-256','assignment_id',r.id,'waiver_id',r.waiver_id,
      'athlete_profile_id',r.athlete_id,'signed_by_user_id',auth.uid(),'signed_at',signed_time,'signer_relationship',p_signer_relationship,
      'authority_attested',true,'electronic_consent_attested',true,'consent_version',p_consent_version),updated_at=signed_time
    where id=r.id returning * into r;
  perform public.record_paperwork_event('coach_waiver',r.waiver_id,'signed',r.athlete_id,jsonb_build_object('assignment_id',r.id));
  perform public.notify_user(w.coach_id,'Waiver signed',coalesce(r.signed_title_snapshot,'A waiver')||' was signed.','waiver',r.id);
  return r;
end $$;
revoke all on function public.sign_coach_waiver_with_authority(uuid,text,text,boolean,boolean,text,text,text) from public,anon;
grant execute on function public.sign_coach_waiver_with_authority(uuid,text,text,boolean,boolean,text,text,text) to authenticated;

create or replace function public.sign_org_document_with_authority(
  p_document_id uuid, p_athlete_profile_id uuid, p_signer_name text, p_signer_relationship text,
  p_authority_attested boolean, p_consent_attested boolean,
  p_consent_version text default '2026-08-08', p_client_platform text default 'ios', p_client_app_version text default null
) returns public.org_document_completions language plpgsql security definer set search_path=public as $$
declare r public.org_document_completions%rowtype; d public.org_documents%rowtype; org_name text; signed_time timestamptz:=clock_timestamp(); proof_hash text;
begin
  if auth.uid() is null or not public.owns_athlete_profile(p_athlete_profile_id) then raise exception 'Document access denied'; end if;
  if nullif(trim(p_signer_name),'') is null then raise exception 'Signer name is required'; end if;
  if p_signer_relationship not in ('parent','legal_guardian','adult_athlete','authorized_representative') then raise exception 'Select the signer relationship'; end if;
  if not coalesce(p_authority_attested,false) then raise exception 'You must confirm authority to sign'; end if;
  if not coalesce(p_consent_attested,false) then raise exception 'You must consent to electronic records and signatures'; end if;
  select * into d from public.org_documents where id=p_document_id and lifecycle_status='published'
    and public.is_org_document_assigned(id,p_athlete_profile_id)
    and (effective_at is null or effective_at<=now()) and (expires_at is null or expires_at>now());
  if not found then raise exception 'This document is not currently available for signature'; end if;
  select coalesce(nullif(trim(os.org_name),''),'Organization') into org_name from public.org_settings os where os.org_id=d.org_id;
  org_name:=coalesce(org_name,'Organization');
  select * into r from public.org_document_completions where document_id=p_document_id and athlete_id=p_athlete_profile_id for update;
  if found and r.signature_hash is not null then return r; end if;
  proof_hash:=encode(extensions.digest(p_document_id::text||E'\n'||coalesce(d.title,'')||E'\n'||org_name||E'\n'||trim(p_signer_name)||E'\n'||p_signer_relationship||E'\n'||signed_time::text,'sha256'),'hex');
  insert into public.org_document_completions(document_id,athlete_id,status,completed_at,signature_name,signed_title_snapshot,
    signed_org_name_snapshot,signed_by_user_id,signature_hash,signer_relationship,signer_authority_attested,electronic_consent_attested,
    consent_version,client_platform,client_app_version,signature_audit,updated_at)
  values(p_document_id,p_athlete_profile_id,'complete',signed_time,trim(p_signer_name),coalesce(d.title,'Document'),org_name,auth.uid(),proof_hash,
    p_signer_relationship,true,true,p_consent_version,p_client_platform,p_client_app_version,
    jsonb_build_object('version',2,'algorithm','SHA-256','document_id',p_document_id,'athlete_profile_id',p_athlete_profile_id,
      'signed_by_user_id',auth.uid(),'signed_at',signed_time,'signer_relationship',p_signer_relationship,'authority_attested',true,
      'electronic_consent_attested',true,'consent_version',p_consent_version),signed_time)
  on conflict(document_id,athlete_id) do update set status='complete',completed_at=excluded.completed_at,signature_name=excluded.signature_name,
    signed_title_snapshot=excluded.signed_title_snapshot,signed_org_name_snapshot=excluded.signed_org_name_snapshot,
    signed_by_user_id=excluded.signed_by_user_id,signature_hash=excluded.signature_hash,signer_relationship=excluded.signer_relationship,
    signer_authority_attested=true,electronic_consent_attested=true,consent_version=excluded.consent_version,
    client_platform=excluded.client_platform,client_app_version=excluded.client_app_version,signature_audit=excluded.signature_audit,updated_at=signed_time
  returning * into r;
  perform public.record_paperwork_event('org_document',p_document_id,'signed',p_athlete_profile_id,'{}');
  return r;
end $$;
revoke all on function public.sign_org_document_with_authority(uuid,uuid,text,text,boolean,boolean,text,text,text) from public,anon;
grant execute on function public.sign_org_document_with_authority(uuid,uuid,text,text,boolean,boolean,text,text,text) to authenticated;

create or replace function public.send_paperwork_reminders(p_record_type text,p_record_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare sent integer:=0; recipient record; title_text text;
begin
  if p_record_type='org_document' then
    select d.title into title_text from public.org_documents d where d.id=p_record_id and public.is_org_director(d.org_id);
    if not found then raise exception 'Document access denied'; end if;
    for recipient in select distinct ap.owner_user_id user_id,ap.id athlete_id from public.org_document_assignment_status(p_record_id) s
      join public.athlete_profiles ap on ap.id=s.athlete_id where s.status<>'complete'
    loop perform public.notify_user(recipient.user_id,'Signature reminder',title_text||' is waiting for your signature.','waiver',p_record_id); sent:=sent+1; end loop;
  elsif p_record_type='coach_waiver' then
    select w.title into title_text from public.coach_waivers w where w.id=p_record_id and w.coach_id=auth.uid();
    if not found then raise exception 'Waiver access denied'; end if;
    for recipient in select distinct ap.owner_user_id user_id,a.athlete_id from public.coach_waiver_assignments a
      join public.athlete_profiles ap on ap.id=a.athlete_id where a.waiver_id=p_record_id and a.status<>'signed'
    loop perform public.notify_user(recipient.user_id,'Signature reminder',title_text||' is waiting for your signature.','waiver',p_record_id); sent:=sent+1; end loop;
  else raise exception 'Unsupported paperwork type'; end if;
  perform public.record_paperwork_event(p_record_type,p_record_id,'reminder_sent',null,jsonb_build_object('recipient_count',sent));
  return sent;
end $$;
revoke all on function public.send_paperwork_reminders(text,uuid) from public,anon;
grant execute on function public.send_paperwork_reminders(text,uuid) to authenticated;

create or replace function public.archive_paperwork(p_record_type text,p_record_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_record_type='org_document' then
    update public.org_documents set lifecycle_status='archived',archived_at=now(),updated_at=now()
      where id=p_record_id and public.is_org_director(org_id);
  elsif p_record_type='coach_waiver' then
    update public.coach_waivers set lifecycle_status='archived',archived_at=now(),updated_at=now()
      where id=p_record_id and coach_id=auth.uid();
  else raise exception 'Unsupported paperwork type'; end if;
  if not found then raise exception 'Paperwork access denied'; end if;
  perform public.record_paperwork_event(p_record_type,p_record_id,'archived',null,'{}');
end $$;
revoke all on function public.archive_paperwork(text,uuid) from public,anon;
grant execute on function public.archive_paperwork(text,uuid) to authenticated;

create or replace function public.paperwork_compliance_export(p_record_type text,p_record_id uuid)
returns table(athlete_id uuid,athlete_name text,status text,signed_at timestamptz,signer_name text,
  signer_relationship text,signature_hash text,pdf_sha256 text,due_at timestamptz,is_overdue boolean)
language plpgsql stable security definer set search_path=public as $$
begin
  if p_record_type='org_document' then
    return query select s.athlete_id,s.athlete_name,s.status,s.completed_at,c.signature_name,c.signer_relationship,
      c.signature_hash,c.signed_pdf_sha256,d.due_at,(d.due_at is not null and d.due_at<now() and s.status<>'complete')
    from public.org_document_assignment_status(p_record_id) s
    join public.org_documents d on d.id=p_record_id
    left join public.org_document_completions c on c.document_id=p_record_id and c.athlete_id=s.athlete_id
    where public.is_org_director(d.org_id);
  elsif p_record_type='coach_waiver' then
    return query select a.athlete_id,coalesce(nullif(trim(ap.full_name),''),'Athlete'),a.status,a.signed_at,a.signature_name,
      a.signer_relationship,a.signature_hash,a.signed_pdf_sha256,w.due_at,
      (w.due_at is not null and w.due_at<now() and a.status<>'signed')
    from public.coach_waiver_assignments a join public.coach_waivers w on w.id=a.waiver_id
    join public.athlete_profiles ap on ap.id=a.athlete_id
    where w.id=p_record_id and w.coach_id=auth.uid();
  else raise exception 'Unsupported paperwork type'; end if;
end $$;
revoke all on function public.paperwork_compliance_export(text,uuid) from public,anon;
grant execute on function public.paperwork_compliance_export(text,uuid) to authenticated;

insert into storage.buckets(id,name,public) values('coach-waivers','coach-waivers',false)
on conflict(id) do update set public=false;
insert into storage.buckets(id,name,public) values('signed-paperwork','signed-paperwork',false)
on conflict(id) do update set public=false;

drop policy if exists coach_waiver_files_insert_owner on storage.objects;
create policy coach_waiver_files_insert_owner on storage.objects for insert to authenticated
with check(bucket_id='coach-waivers' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists coach_waiver_files_read_authorized on storage.objects;
create policy coach_waiver_files_read_authorized on storage.objects for select to authenticated using(
  bucket_id='coach-waivers' and exists(
    select 1 from public.coach_waivers w left join public.coach_waiver_assignments a on a.waiver_id=w.id
    left join public.athlete_profiles ap on ap.id=a.athlete_id
    where w.storage_path=name and (w.coach_id=auth.uid() or ap.owner_user_id=auth.uid())
  )
);
drop policy if exists coach_waiver_files_delete_unsigned on storage.objects;
create policy coach_waiver_files_delete_unsigned on storage.objects for delete to authenticated using(
  bucket_id='coach-waivers' and (storage.foldername(name))[1]=auth.uid()::text
  and not exists(select 1 from public.coach_waivers w join public.coach_waiver_assignments a on a.waiver_id=w.id
    where w.storage_path=name and a.status='signed')
);

-- The proof generator uses the service role. Clients can only read artifacts
-- they own or issued; no client can upload/replace a signed artifact.
drop policy if exists signed_paperwork_read_authorized on storage.objects;
create policy signed_paperwork_read_authorized on storage.objects for select to authenticated using (
  bucket_id='signed-paperwork' and (
    exists(select 1 from public.coach_waiver_assignments a join public.coach_waivers w on w.id=a.waiver_id
      join public.athlete_profiles ap on ap.id=a.athlete_id where a.signed_pdf_storage_path=name and (ap.owner_user_id=auth.uid() or w.coach_id=auth.uid()))
    or exists(select 1 from public.org_document_completions c join public.org_documents d on d.id=c.document_id
      join public.athlete_profiles ap on ap.id=c.athlete_id where c.signed_pdf_storage_path=name and (ap.owner_user_id=auth.uid() or public.is_org_director(d.org_id)))
  )
);

create index if not exists org_documents_due_idx on public.org_documents(due_at) where lifecycle_status='published';
create index if not exists coach_waivers_due_idx on public.coach_waivers(due_at) where lifecycle_status='published';
