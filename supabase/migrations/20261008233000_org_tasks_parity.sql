-- Canonical organization task contract shared by web and iOS.
create table if not exists public.org_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  details text,
  category text not null default 'general' check (category in ('general','roster','schedule','payments','documents','compliance','operations')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  due_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_tasks_open_due_idx on public.org_tasks(org_id,status,due_at);
create index if not exists org_tasks_assignee_idx on public.org_tasks(assigned_to,status);
alter table public.org_tasks enable row level security;

drop policy if exists org_tasks_read on public.org_tasks;
create policy org_tasks_read on public.org_tasks for select to authenticated using (
  public.is_org_director(org_id) or assigned_to=auth.uid() or exists (
    select 1 from public.organization_memberships membership
    where membership.org_id=org_tasks.org_id and membership.user_id=auth.uid() and membership.status='active'
  )
);
drop policy if exists org_tasks_create on public.org_tasks;
create policy org_tasks_create on public.org_tasks for insert to authenticated
with check (public.account_is_active(auth.uid()) and public.is_org_director(org_id) and created_by=auth.uid());
drop policy if exists org_tasks_manage on public.org_tasks;
create policy org_tasks_manage on public.org_tasks for update to authenticated
using (public.account_is_active(auth.uid()) and (public.is_org_director(org_id) or assigned_to=auth.uid()))
with check (public.account_is_active(auth.uid()) and (public.is_org_director(org_id) or assigned_to=auth.uid()));
drop policy if exists org_tasks_delete on public.org_tasks;
create policy org_tasks_delete on public.org_tasks for delete to authenticated
using (public.account_is_active(auth.uid()) and public.is_org_director(org_id));
grant select,insert,update,delete on public.org_tasks to authenticated;

create or replace function public.guard_org_task_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null then
    if not public.account_is_active(auth.uid()) then raise exception 'Task access denied' using errcode='42501'; end if;
    if tg_op='INSERT' and (not public.is_org_director(new.org_id) or new.created_by<>auth.uid())
      then raise exception 'Task creation denied' using errcode='42501';
    elsif tg_op='UPDATE' then
      if new.org_id<>old.org_id or new.id<>old.id or new.created_by<>old.created_by or new.created_at<>old.created_at
        then raise exception 'Task identity cannot change' using errcode='42501'; end if;
      if not public.is_org_director(old.org_id) and (
        old.assigned_to is distinct from auth.uid() or new.status not in ('open','completed') or
        (to_jsonb(new)-array['status','completed_at','updated_at']) is distinct from (to_jsonb(old)-array['status','completed_at','updated_at'])
      ) then raise exception 'Assignees may only complete or reopen their tasks' using errcode='42501'; end if;
    end if;
    if new.assigned_to is not null and not exists (
      select 1 from public.organization_memberships membership where membership.org_id=new.org_id
        and membership.user_id=new.assigned_to and membership.status='active' and public.account_is_active(membership.user_id)
    ) then raise exception 'Assignee must be an active organization member' using errcode='22023'; end if;
  end if;
  new.updated_at:=now();
  if new.status='completed' then
    if tg_op='INSERT' or old.status is distinct from 'completed' then new.completed_at:=now(); end if;
  else new.completed_at:=null; end if;
  return new;
end $$;
drop trigger if exists guard_org_task_write on public.org_tasks;
create trigger guard_org_task_write before insert or update on public.org_tasks for each row execute function public.guard_org_task_write();
revoke all on function public.guard_org_task_write() from public,anon,authenticated;
