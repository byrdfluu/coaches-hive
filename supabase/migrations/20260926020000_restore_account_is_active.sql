-- Notification triggers use this helper to avoid notifying suspended accounts.
-- Keep it small, stable, and security-definer so trigger execution does not
-- depend on the caller's profile RLS visibility.
create or replace function public.account_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and coalesce(p.status, 'active') = 'active'
  );
$$;

revoke all on function public.account_is_active(uuid) from public, anon;
grant execute on function public.account_is_active(uuid) to authenticated, service_role;
