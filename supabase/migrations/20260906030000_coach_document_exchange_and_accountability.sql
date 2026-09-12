-- Private, auditable document exchange between organizations and their coaches.
alter table public.audit_logs add column if not exists target_id text;

create table if not exists public.coach_document_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 160),
  description text,
  document_type text not null default 'document',
  due_at timestamptz,
  expires_at timestamptz,
  status text not null default 'requested' check (status in ('requested','submitted','approved','rejected','cancelled')),
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_document_submissions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.coach_document_requests(id) on delete cascade,
  submitted_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  storage_path text not null,
  filename text not null,
  content_type text,
  file_sha256 text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists coach_document_requests_org_status_idx on public.coach_document_requests(org_id,status,due_at);
create index if not exists coach_document_requests_coach_status_idx on public.coach_document_requests(coach_id,status,due_at);
create index if not exists coach_document_submissions_request_idx on public.coach_document_submissions(request_id,created_at desc);

alter table public.coach_document_requests enable row level security;
alter table public.coach_document_submissions enable row level security;

drop policy if exists coach_document_requests_director_all on public.coach_document_requests;
create policy coach_document_requests_director_all on public.coach_document_requests for all to authenticated
  using (public.is_org_director(org_id)) with check (
    public.is_org_director(org_id) and exists (
      select 1 from public.organization_memberships m
      where m.org_id=coach_document_requests.org_id and m.user_id=coach_document_requests.coach_id
        and m.status='active' and lower(coalesce(m.role,'')) in ('coach','assistant_coach')
    )
  );

drop policy if exists coach_document_requests_coach_read on public.coach_document_requests;
create policy coach_document_requests_coach_read on public.coach_document_requests for select to authenticated
  using (coach_id=auth.uid());

drop policy if exists coach_document_submissions_visible on public.coach_document_submissions;
create policy coach_document_submissions_visible on public.coach_document_submissions for select to authenticated
  using (exists (select 1 from public.coach_document_requests r where r.id=request_id and (r.coach_id=auth.uid() or public.is_org_director(r.org_id))));

drop policy if exists coach_document_submissions_coach_insert on public.coach_document_submissions;
create policy coach_document_submissions_coach_insert on public.coach_document_submissions for insert to authenticated
  with check (submitted_by=auth.uid() and exists (
    select 1 from public.coach_document_requests r where r.id=request_id and r.coach_id=auth.uid() and r.status in ('requested','rejected')
  ));

create or replace function public.sync_coach_document_request_status() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.coach_document_requests set status='submitted',review_note=null,reviewed_by=null,reviewed_at=null,updated_at=now()
  where id=new.request_id and coach_id=new.submitted_by;
  return new;
end $$;
drop trigger if exists sync_coach_document_request_status_trigger on public.coach_document_submissions;
create trigger sync_coach_document_request_status_trigger after insert on public.coach_document_submissions
for each row execute function public.sync_coach_document_request_status();

create or replace function public.review_coach_document_request(p_request_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare r public.coach_document_requests%rowtype;
begin
  select * into r from public.coach_document_requests where id=p_request_id;
  if r.id is null or not public.is_org_director(r.org_id) then raise exception 'Organization director access required'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
  if r.status <> 'submitted' then raise exception 'Only submitted documents can be reviewed'; end if;
  update public.coach_document_requests set status=p_decision,review_note=nullif(trim(coalesce(p_note,'')),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=p_request_id;
end $$;
revoke all on function public.review_coach_document_request(uuid,text,text) from public,anon;
grant execute on function public.review_coach_document_request(uuid,text,text) to authenticated;

-- Coaches upload only inside their org/request folder; both parties can privately read it.
drop policy if exists coach_request_files_insert on storage.objects;
create policy coach_request_files_insert on storage.objects for insert to authenticated with check (
  bucket_id='org-documents' and exists (
    select 1 from public.coach_document_requests r
    where r.coach_id=auth.uid() and r.status in ('requested','rejected')
      and (storage.foldername(name))[1]=lower(r.org_id::text)
      and (storage.foldername(name))[2]=lower(r.id::text)
  )
);
drop policy if exists coach_request_files_read on storage.objects;
create policy coach_request_files_read on storage.objects for select to authenticated using (
  bucket_id='org-documents' and exists (
    select 1 from public.coach_document_submissions s join public.coach_document_requests r on r.id=s.request_id
    where s.storage_path=name and (r.coach_id=auth.uid() or public.is_org_director(r.org_id))
  )
);

-- Use the established organization audit stream for accountability.
create or replace function public.audit_coach_document_exchange() returns trigger language plpgsql security definer set search_path=public as $$
declare oid uuid; action_name text; target uuid;
begin
  if tg_table_name='coach_document_submissions' then
    select org_id into oid from public.coach_document_requests where id=new.request_id;
    action_name:='coach_document_submitted'; target:=new.request_id;
  else
    oid:=new.org_id; target:=new.id;
    action_name:=case when tg_op='INSERT' then 'coach_document_requested' else 'coach_document_' || new.status end;
  end if;
  insert into public.audit_logs(org_id,actor_id,action,target_id)
  values(oid,auth.uid(),action_name,target::text);
  return new;
end $$;
drop trigger if exists audit_coach_document_request_trigger on public.coach_document_requests;
create trigger audit_coach_document_request_trigger after insert or update of status on public.coach_document_requests
for each row execute function public.audit_coach_document_exchange();
drop trigger if exists audit_coach_document_submission_trigger on public.coach_document_submissions;
create trigger audit_coach_document_submission_trigger after insert on public.coach_document_submissions
for each row execute function public.audit_coach_document_exchange();
