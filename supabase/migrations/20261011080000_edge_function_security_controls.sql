create table if not exists public.edge_action_rate_limits (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (length(action) between 1 and 80),
  resource_key text not null default '',
  created_at timestamptz not null default now()
);
alter table public.edge_action_rate_limits enable row level security;
revoke all on public.edge_action_rate_limits from public, anon, authenticated;
grant all on public.edge_action_rate_limits to service_role;
create index if not exists edge_action_rate_limits_lookup_idx
  on public.edge_action_rate_limits(actor_user_id, action, resource_key, created_at desc);

create or replace function public.assert_edge_action_rate_limit(
  p_actor_user_id uuid, p_action text, p_resource_key text,
  p_max_attempts integer, p_window_seconds integer
) returns void language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_actor_user_id is null or nullif(trim(p_action),'') is null or p_max_attempts not between 1 and 1000 or p_window_seconds not between 1 and 86400
  then raise exception 'Invalid edge rate-limit request' using errcode='22023'; end if;
  delete from public.edge_action_rate_limits where created_at < now() - interval '24 hours';
  select count(*) into v_count from public.edge_action_rate_limits
   where actor_user_id=p_actor_user_id and action=p_action and resource_key=coalesce(p_resource_key,'')
     and created_at >= now() - make_interval(secs => p_window_seconds);
  if v_count >= p_max_attempts then raise exception 'Rate limit reached' using errcode='P0001'; end if;
  insert into public.edge_action_rate_limits(actor_user_id,action,resource_key)
  values(p_actor_user_id,p_action,coalesce(p_resource_key,''));
end $$;
revoke all on function public.assert_edge_action_rate_limit(uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.assert_edge_action_rate_limit(uuid,text,text,integer,integer) to service_role;
