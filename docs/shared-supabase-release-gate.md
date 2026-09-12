# Shared Supabase release gate

The web and iOS clients use Supabase project `fxmxrzhucccneoibksny`. The generated
web database contract is `src/types/database.ts`; regenerate it before releases
that change tables, functions, storage, authentication, RLS, or realtime.

## Required checks

1. `available_workspaces`, `set_active_workspace`, `my_league_contexts`,
   `my_coach_team_contexts`, and `my_accessible_athlete_profiles` return only the
   authenticated identity's active assignments.
2. Role/workspace changes use the shared RPC boundary. Auth metadata is a client
   routing hint, never the authorization source.
3. Family athlete selection uses `my_accessible_athlete_profiles`; athlete
   profiles remain non-public.
4. Group messaging and recipient audiences use `create_group_thread` and
   `message_program_audiences`; row policies remain authoritative for realtime.
5. Paperwork reminder/archive operations use `send_paperwork_reminders` and
   `archive_paperwork`. Private documents use the `org-documents` bucket.
6. League, season reports, storage, and realtime changes are verified in both
   directions between a web session and iOS test account.
7. Payment completion remains signed-webhook-only and all money fields are
   integer cents. Run the real Stripe test-mode suite without skipped cases.

## Migration history reconciliation

On 2026-09-12 the production catalog was compared with all local migrations.
The missing `org_settings.processing_fee_rate` field and
`update_org_member_access_atomic` RPC were added through
`20260912020000_production_schema_reconciliation.sql` without replaying obsolete
pricing rewrites. The historical ledger was then baselined. A final linked
migration listing confirmed that every local version through `20260912020000`
has an identical remote version.
