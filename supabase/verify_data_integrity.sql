-- Data integrity verification for Supabase
-- Run in Supabase SQL Editor (Production and Preview separately).
-- Returns a deterministic PASS/FAIL summary plus detailed issues.

begin;

create temp table if not exists _integrity_failures (
  issue text not null,
  detail text not null
) on commit drop;

truncate _integrity_failures;

-- 1) Required tables referenced by the app
with required_tables(table_name) as (
  values
    ('admin_audit_log'),
    ('admin_configs'),
    ('athlete_media'),
    ('athlete_metrics'),
    ('athlete_payment_methods'),
    ('athlete_plans'),
    ('athlete_progress_notes'),
    ('athlete_results'),
    ('availability_blocks'),
    ('backup_policies'),
    ('coach_athlete_links'),
    ('coach_payouts'),
    ('coach_plans'),
    ('coach_reviews'),
    ('dashboard_layouts'),
    ('data_retention_policies'),
    ('data_retention_runs'),
    ('demand_signal_events'),
    ('email_deliveries'),
    ('email_events'),
    ('emergency_contacts'),
    ('guardian_approvals'),
    ('guardian_athlete_links'),
    ('message_attachments'),
    ('message_receipts'),
    ('messages'),
    ('notifications'),
    ('order_disputes'),
    ('order_refund_requests'),
    ('orders'),
    ('org_audit_log'),
    ('org_compliance_uploads'),
    ('org_fee_assignments'),
    ('org_fee_reminders'),
    ('org_fees'),
    ('org_invites'),
    ('org_onboarding'),
    ('org_report_schedules'),
    ('org_role_permissions'),
    ('org_settings'),
    ('org_team_coaches'),
    ('org_team_members'),
    ('org_teams'),
    ('organization_memberships'),
    ('organizations'),
    ('payment_receipts'),
    ('platform_fee_rules'),
    ('practice_plan_attachments'),
    ('practice_plans'),
    ('products'),
    ('profile_visibility'),
    ('profiles'),
    ('referral_codes'),
    ('referrals'),
    ('reviews'),
    ('session_payments'),
    ('sessions'),
    ('support_messages'),
    ('support_tickets'),
    ('thread_participants'),
    ('threads'),
    ('user_integrations'),
    ('user_onboarding')
)
insert into _integrity_failures(issue, detail)
select 'missing_table', table_name
from required_tables
where to_regclass(format('public.%I', table_name)) is null;

-- 2) Critical columns for core flows
with required_columns(table_name, column_name) as (
  values
    ('profiles', 'id'),
    ('profiles', 'role'),
    ('profiles', 'full_name'),

    ('organizations', 'id'),
    ('organizations', 'name'),

    ('organization_memberships', 'id'),
    ('organization_memberships', 'user_id'),
    ('organization_memberships', 'org_id'),
    ('organization_memberships', 'role'),

    ('org_settings', 'org_id'),
    ('org_teams', 'id'),
    ('org_teams', 'org_id'),
    ('org_team_members', 'id'),
    ('org_team_members', 'team_id'),
    ('org_team_coaches', 'id'),
    ('org_team_coaches', 'team_id'),
    ('org_team_coaches', 'coach_id'),

    ('products', 'id'),
    ('products', 'coach_id'),
    ('products', 'org_id'),
    ('products', 'title'),

    ('orders', 'id'),
    ('orders', 'product_id'),
    ('orders', 'athlete_id'),
    ('orders', 'coach_id'),
    ('orders', 'status'),

    ('threads', 'id'),
    ('thread_participants', 'id'),
    ('thread_participants', 'thread_id'),
    ('thread_participants', 'user_id'),
    ('messages', 'id'),
    ('messages', 'thread_id'),
    ('messages', 'sender_id'),

    ('coach_reviews', 'id'),
    ('coach_reviews', 'coach_id'),
    ('coach_reviews', 'athlete_id'),
    ('coach_reviews', 'rating'),
    ('coach_reviews', 'body'),
    ('coach_reviews', 'status'),

    -- The athlete marketplace page currently references public.reviews
    ('reviews', 'id'),
    ('reviews', 'product_id'),
    ('reviews', 'athlete_id'),
    ('reviews', 'rating'),
    ('reviews', 'body'),

    ('referral_codes', 'id'),
    ('referral_codes', 'user_id'),
    ('referral_codes', 'code'),
    ('referrals', 'id'),
    ('referrals', 'referrer_id'),
    ('referrals', 'referee_id'),
    ('referrals', 'code'),
    ('guardian_athlete_links', 'id'),
    ('guardian_athlete_links', 'guardian_user_id'),
    ('guardian_athlete_links', 'athlete_id'),
    ('guardian_athlete_links', 'status'),

    ('user_onboarding', 'user_id'),
    ('user_onboarding', 'role'),
    ('user_onboarding', 'completed_steps'),
    ('org_onboarding', 'org_id'),
    ('org_onboarding', 'completed_steps')
)
insert into _integrity_failures(issue, detail)
select 'missing_column', rc.table_name || '.' || rc.column_name
from required_columns rc
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = rc.table_name
 and c.column_name = rc.column_name
where c.column_name is null;

-- 3) RLS required on tables accessed via browser Supabase client
with client_tables(table_name) as (
  values
    ('athlete_media'),
    ('athlete_metrics'),
    ('athlete_payment_methods'),
    ('athlete_plans'),
    ('athlete_progress_notes'),
    ('athlete_results'),
    ('availability_blocks'),
    ('coach_athlete_links'),
    ('coach_payouts'),
    ('coach_plans'),
    ('coach_reviews'),
    ('guardian_approvals'),
    ('guardian_athlete_links'),
    ('message_attachments'),
    ('message_receipts'),
    ('messages'),
    ('order_refund_requests'),
    ('orders'),
    ('org_compliance_uploads'),
    ('org_fee_assignments'),
    ('org_fees'),
    ('org_role_permissions'),
    ('org_settings'),
    ('org_team_coaches'),
    ('org_team_members'),
    ('org_teams'),
    ('organization_memberships'),
    ('organizations'),
    ('platform_fee_rules'),
    ('practice_plans'),
    ('products'),
    ('profile_visibility'),
    ('profiles'),
    ('reviews'),
    ('session_payments'),
    ('sessions'),
    ('thread_participants'),
    ('threads')
)
insert into _integrity_failures(issue, detail)
select 'rls_not_enabled', ct.table_name
from client_tables ct
join pg_class c
  on c.relname = ct.table_name
join pg_namespace n
  on n.oid = c.relnamespace
 and n.nspname = 'public'
where c.relkind = 'r'
  and not c.relrowsecurity;

-- 4) If RLS is enabled on client table, at least one policy must exist
with client_tables(table_name) as (
  values
    ('athlete_media'),
    ('athlete_metrics'),
    ('athlete_payment_methods'),
    ('athlete_plans'),
    ('athlete_progress_notes'),
    ('athlete_results'),
    ('availability_blocks'),
    ('coach_athlete_links'),
    ('coach_payouts'),
    ('coach_plans'),
    ('coach_reviews'),
    ('guardian_approvals'),
    ('guardian_athlete_links'),
    ('message_attachments'),
    ('message_receipts'),
    ('messages'),
    ('order_refund_requests'),
    ('orders'),
    ('org_compliance_uploads'),
    ('org_fee_assignments'),
    ('org_fees'),
    ('org_role_permissions'),
    ('org_settings'),
    ('org_team_coaches'),
    ('org_team_members'),
    ('org_teams'),
    ('organization_memberships'),
    ('organizations'),
    ('platform_fee_rules'),
    ('practice_plans'),
    ('products'),
    ('profile_visibility'),
    ('profiles'),
    ('reviews'),
    ('session_payments'),
    ('sessions'),
    ('thread_participants'),
    ('threads')
),
rls_enabled as (
  select ct.table_name
  from client_tables ct
  join pg_class c
    on c.relname = ct.table_name
  join pg_namespace n
    on n.oid = c.relnamespace
   and n.nspname = 'public'
  where c.relkind = 'r'
    and c.relrowsecurity
)
insert into _integrity_failures(issue, detail)
select 'no_policies_on_rls_table', re.table_name
from rls_enabled re
where not exists (
  select 1
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = re.table_name
);

-- 5) anon/authenticated should never bypass RLS
insert into _integrity_failures(issue, detail)
select 'role_bypasses_rls', r.rolname
from pg_roles r
where r.rolname in ('anon', 'authenticated')
  and r.rolbypassrls;

-- 6) Migration history table should exist for verifiable "migrations applied"
insert into _integrity_failures(issue, detail)
select 'missing_migration_history', 'supabase_migrations.schema_migrations not found'
where to_regclass('supabase_migrations.schema_migrations') is null;

do $$
declare
  migrations_row_count bigint;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select count(*) from supabase_migrations.schema_migrations'
      into migrations_row_count;
    if migrations_row_count = 0 then
      insert into _integrity_failures(issue, detail)
      values ('empty_migration_history', 'supabase_migrations.schema_migrations has 0 rows');
    end if;
  end if;
end
$$;

-- Summary + details
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end as status,
  count(*) as issue_count
from _integrity_failures;

select issue, detail
from _integrity_failures
order by issue, detail;

rollback;
