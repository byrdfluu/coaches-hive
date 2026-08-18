# Data architecture audit — 2026-08-18

## Current authoritative model

- `athlete_profiles` is the durable player identity. It already separates a player profile ID from its owning user through `owner_user_id` and supports multiple child profiles per family account. Creating a second `players` table would split identity.
- `organizations`, `org_teams`, `organization_memberships`, `org_team_members`, `business_workspaces`, and `workspace_memberships` are the established organization graph.
- Guardian ownership currently exists primarily through `athlete_profiles.owner_user_id`, `family_subscription_athletes`, and player-specific access helpers. There was no durable household entity or multi-guardian junction.
- `payment_transactions` is the canonical integer-cent ledger introduced by the payments-core migrations. Legacy receipts, org payments, fee assignments, registrations, marketplace orders, and Stripe accounting remain for compatibility and are progressively projected into the ledger.
- Registration participation was fragmented across enrollment submissions, team memberships, tryout registrations, and program registrations. There was no durable, season-aware participation record independent of player identity.
- RLS is enabled on payment-core, workspace, waiver, Stripe accounting, and operational tables. Ledger writes are server/service-role only. Some legacy application routes still query Supabase directly and should continue migrating toward server authorization.
- PostHog was configured and several signup, waiver, checkout, and lifecycle events existed, but there was no single documented product taxonomy and the requested activation/revenue coverage was incomplete.
- The public enrollment route collected a DOB but did not validate youth age or require affirmative under-13 parental consent. Player-specific export and anonymization endpoints were absent.

## Changes in the foundation migration

- Adds `families` and `family_members` while retaining `athlete_profiles` as the player record.
- Adds family, location, COPPA, and archival attributes to persistent player profiles.
- Preserves the legacy `athlete_profiles.birthdate` text column to avoid a destructive type rewrite and validates it through an immutable safe ISO-date parser. A later maintenance migration may convert it to `date` after every legacy value is clean.
- Adds `player_participations` for team/season history without cloning players.
- Extends `payment_transactions` with historical rate, family, recurring, off-platform, sport, and age-group dimensions.
- Adds `athlete_profile_id` beside the legacy profile-user `player_id`, then safely links primary profiles. This is required because sub-player UUIDs do not exist in `profiles`; new integrations should use `athlete_profile_id`.
- Adds an append-only `data_audit_log`, scoped RLS, and server-only writes.
- Adds `org_payment_summary`, `player_participation_history`, `org_health_metrics`, and service-only anonymized `market_insights` views.
- Uses `NOT VALID` for new constraints that could conflict with unknown legacy rows: existing data is preserved while new writes are protected. Validation should follow a production data-quality report.

## Remaining operational work

- Configure Supabase backups and point-in-time recovery in the Supabase project dashboard; repository code cannot enable the account-level feature.
- Have privacy counsel review the COPPA notice, consent evidence standard, retention schedule, and privacy policy before launch.
- Add a verified-email consent step if counsel or risk review requires stronger verifiable parental consent.
- Deliver the same event names and property types from iOS; the mobile team should use the taxonomy below and never include child names, emails, DOBs, or free-form notes in analytics.
- Backfill family and participation links only after running duplicate reports. No automatic identity merge is included because false merges are destructive.

## Analytics taxonomy

Activation: `roster_player_added`, `schedule_created`, `payment_processed`, `registration_link_created`, `registration_completed`, `waiver_signed`.

Engagement: `user_login`, `dashboard_viewed`, `message_sent`, `payment_reminder_sent`, `roster_exported`, `schedule_shared`.

Growth: `referral_link_generated`, `referral_link_clicked`, `referral_converted`, `org_coach_invited`, `org_upgraded`.

Revenue: `subscription_started`, `subscription_canceled`, `subscription_renewed`, `platform_fee_earned`.

Property names must match the implementation brief and monetary properties must be integer cents. IDs are permitted; direct child PII is prohibited.
