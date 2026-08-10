-- Separate operational review from confirmed resolution. Safe to rerun.

alter table public.admin_ops_issue_resolutions
  add column if not exists checked_by uuid references public.profiles(id) on delete set null,
  add column if not exists checked_at timestamptz;

alter table public.admin_ops_issue_resolutions
  drop constraint if exists admin_ops_issue_resolutions_status_check;

alter table public.admin_ops_issue_resolutions
  add constraint admin_ops_issue_resolutions_status_check
  check (status in ('open', 'checked', 'resolved'));

create or replace function public.admin_set_ops_issue_status(
  p_issue_key text,
  p_title text,
  p_detail text,
  p_category text,
  p_status text,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_status text := lower(trim(coalesce(p_status, '')));
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Superadmin access required';
  end if;
  if clean_status not in ('open', 'checked', 'resolved') then
    raise exception 'Unsupported issue status';
  end if;

  insert into public.admin_ops_issue_resolutions(
    issue_key, title, detail, category, status, resolution_note,
    checked_by, checked_at, resolved_by, resolved_at, reopened_at, updated_at
  ) values (
    p_issue_key, p_title, p_detail, p_category, clean_status,
    nullif(trim(p_note), ''),
    case when clean_status in ('checked', 'resolved') then auth.uid() else null end,
    case when clean_status in ('checked', 'resolved') then now() else null end,
    case when clean_status = 'resolved' then auth.uid() else null end,
    case when clean_status = 'resolved' then now() else null end,
    case when clean_status = 'open' then now() else null end,
    now()
  ) on conflict(issue_key) do update set
    title = excluded.title,
    detail = excluded.detail,
    category = excluded.category,
    status = excluded.status,
    resolution_note = excluded.resolution_note,
    checked_by = case
      when clean_status in ('checked', 'resolved')
        then coalesce(public.admin_ops_issue_resolutions.checked_by, auth.uid())
      else null
    end,
    checked_at = case
      when clean_status in ('checked', 'resolved')
        then coalesce(public.admin_ops_issue_resolutions.checked_at, now())
      else null
    end,
    resolved_by = excluded.resolved_by,
    resolved_at = excluded.resolved_at,
    reopened_at = excluded.reopened_at,
    updated_at = now();

  insert into public.admin_audit_log(actor_id, target_type, action, metadata)
  values(
    auth.uid(), 'ops_issue', 'admin.ops_issue.' || clean_status,
    jsonb_build_object(
      'issue_key', p_issue_key,
      'status', clean_status,
      'note', nullif(trim(p_note), '')
    )
  );
end;
$$;

revoke all on function public.admin_set_ops_issue_status(text,text,text,text,text,text)
  from public, anon;
grant execute on function public.admin_set_ops_issue_status(text,text,text,text,text,text)
  to authenticated;
