-- Ensure the shared web/iOS portal records are delivered through Supabase
-- Realtime. RLS continues to determine which rows each authenticated client
-- can receive. The block is idempotent and ignores optional legacy tables.
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'profiles', 'active_workspace_preferences', 'notifications',
    'independent_coach_profiles', 'coach_athlete_links', 'coach_notes',
    'sessions', 'session_attendance', 'messages', 'threads',
    'availability_blocks', 'coach_membership_plans',
    'coach_membership_subscriptions', 'coach_programs',
    'coach_training_plans', 'coach_training_plan_progress', 'products',
    'orders', 'payment_transactions', 'organization_memberships',
    'org_team_coaches', 'org_team_members', 'organizations', 'org_settings',
    'org_teams', 'org_notes', 'org_contacts', 'org_seasons', 'org_games',
    'org_fee_assignments', 'org_dues_schedules', 'org_event_collections',
    'fundraising_campaigns', 'org_compliance_items'
  ] loop
    if to_regclass('public.' || relation_name) is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = relation_name
      ) then
      execute format('alter publication supabase_realtime add table public.%I', relation_name);
    end if;
  end loop;
end $$;
