begin;

do $$
begin
  if has_table_privilege('authenticated','public.payment_transactions','INSERT')
     or has_table_privilege('authenticated','public.payment_transactions','UPDATE')
     or has_table_privilege('authenticated','public.payment_transactions','DELETE') then
    raise exception 'authenticated must not mutate payment_transactions';
  end if;
  if to_regclass('public.stripe_webhook_events') is not null and not exists (
    select 1 from pg_indexes where schemaname='public' and tablename='stripe_webhook_events'
      and indexdef ilike '%unique%event_id%'
  ) then raise exception 'stripe_webhook_events.event_id must be unique'; end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='authorize_workspace_context'
  ) then raise exception 'canonical workspace authorization function is missing'; end if;
end $$;

rollback;
