-- Keep the canonical multi-portal QA account aligned to its David Brown
-- independent-coach persona. This migration is deliberately scoped to the
-- internal test login and does not rename or remove any real coach account.
do $$
declare
  v_user_id uuid;
begin
  select id
    into v_user_id
    from auth.users
   where lower(trim(email)) = 'byrdjuwan7@gmail.com'
   limit 1;

  if v_user_id is null then
    raise notice 'Skipping David Brown QA reconciliation: account not found.';
    return;
  end if;

  update public.profiles
     set full_name = 'David Brown',
         status = 'active',
         updated_at = now()
   where id = v_user_id;

  update public.business_workspaces
     set display_name = 'David Brown',
         status = 'active',
         updated_at = now()
   where owner_user_id = v_user_id
     and workspace_type = 'independent_coach';
end
$$;
