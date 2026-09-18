-- Keep direct authenticated fallback access aligned with the application
-- Superadmin rule. This does not grant anon/public access.

create or replace function public.is_superadmin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id=p_user_id
      and (
        lower(coalesce(p.role,''))='superadmin'
        or (
          lower(coalesce(p.role,''))='admin'
          and lower(coalesce(auth.jwt()->'user_metadata'->>'admin_team_role',''))='superadmin'
        )
      )
  )
$$;

revoke all on function public.is_superadmin(uuid) from public,anon;
grant execute on function public.is_superadmin(uuid) to authenticated,service_role;

drop policy if exists "superadmins read workspace subscriptions" on public.platform_subscriptions;
create policy "superadmins read workspace subscriptions"
  on public.platform_subscriptions
  for select
  to authenticated
  using(public.is_superadmin(auth.uid()));

notify pgrst, 'reload schema';

