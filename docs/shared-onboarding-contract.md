# Shared web and iOS onboarding contract

Web mirrors the SwiftUI `OnboardingViewModel` question IDs. Both clients must treat the following Supabase records as canonical after completion:

- Coach identity and experience: `profiles`
- Independent coach services and booking settings: `independent_coach_profiles`
- Organization profile: `org_settings`
- Athlete/player identity: `athlete_profiles`
- Athlete safety contact: `emergency_contacts`

Web draft answers are saved to authenticated user metadata under `onboarding_answers`. Completion is recorded as `onboarding_completed_at`; pre-plan completion is `prepaywall_onboarding_complete`. These fields let a user resume web onboarding without device-local state.

The canonical question IDs and stages live in `src/lib/sharedOnboardingContract.ts` and match iOS:

- Solo coach pre-plan: `sport`, `experience`, `ageGroups`, `modality`
- Organization director pre-plan: `orgName`, `sports`, `ageGroups`, `location`, `alsoCoach`
- Athlete: no subscription paywall; complete the full athlete flow
- Organization-covered coach: no individual subscription paywall; complete the full org-coach flow

Web reads and writes onboarding through `GET|PUT /api/onboarding/profile`. A partial `PUT` saves `answers`; `prepaywall_complete: true` advances paid self-signups to plan selection; `complete: true` writes the canonical profile records.

iOS must continue reading the canonical tables above. To provide cross-device draft resumption, replace `OnboardingDraftStore` as the sole source with the same auth-metadata keys or a future bearer-authenticated mobile facade over this endpoint. Final profile data must never be duplicated into a web-only table.
