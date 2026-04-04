# Locked Behavior

This file is the repo-level contract for product behavior that must not change unless the user explicitly approves the change.

## Purpose

Use this file to protect behavior that is already approved and working as intended.

If a future request would change anything listed here:

1. Stop.
2. Call out the locked behavior that would change.
3. Get explicit approval before editing code.

## What Counts As A Locked Change

The following count as changing locked behavior:

- changing redirects or default landing pages
- changing role defaults or role switching behavior
- changing save, persistence, or readback rules
- changing checkout or onboarding handoff behavior
- changing public-profile visibility rules
- changing button intent, labels, or destinations
- changing whether a section is shown or hidden
- changing mobile/web parity for an approved UI behavior
- reintroducing sample or demo data into live portal flows

## Required Verification For Locked Areas

Any approved change that touches a locked area must include:

- `npm run lint`
- `npm run build`
- targeted manual verification of the affected flow
- updated tests or a documented reason why tests were not added

## Authentication And Portal Routing

- Dual-role users with both coach and org access must land on the coach dashboard first when signing in without explicit portal intent.
- Coach portal sign-in must land on the coach dashboard, not org onboarding or org setup.
- Users may switch to org view after sign-in through the role switcher.
- Explicit portal intent from a protected coach route must preserve coach access through login.
- `active_role` is the session routing switch. Sign-in must not silently continue if role activation fails.
- Sign-in must not rewrite `profiles.role` just because the user signed in through a different portal.

## Save And Persistence Rules

- Coach settings saves must persist to the saved profile record and remain visible after refresh.
- Coach profile information saved in settings must appear on the public coach profile.
- Coach profile avatar changes must persist in settings, profile, and header identity.
- Athlete and org settings must use saved database state as the source of truth after save.
- Save flows must return real errors instead of generic success toasts when the write fails.
- No critical save flow may rely only on optimistic local state.
- Linked pages must re-read saved server data after a successful write when they surface the same information.

## Billing And Checkout

- Creating an org from the coach flow must continue into Stripe checkout, not bounce back to the same page.
- Existing orgs waiting on payment must be able to continue to payment directly.
- Subscription labels shown on dashboards must match the saved plan shown in settings.
- Coach and org billing labels must come from the platform’s saved plan source of truth, not stale fallback metadata.

## Messaging And Connections

- Direct messaging and approval flows must respect saved privacy and guardian approval rules.
- Message send, org invite, guardian invite, and guardian approval flows must return real failures and emit server flow telemetry.
- Saved links between coach-athlete, guardian-athlete, and org memberships must persist after refresh.

## Athlete Experience

- Athlete Discover must remain coach-focused in current launch mode; org/team browsing is hidden unless the launch surface is explicitly reopened.
- Opening a coach profile from athlete Discover must stay inside the athlete portal shell, not switch to the public marketing shell.
- Athlete Family & Safety save must persist guardian info and emergency contacts through saved backend state, not temporary local UI state.
- Saving guardian info must surface the real guardian-link lifecycle: pending invite before acceptance, linked guardian after acceptance or existing guardian-account resolution.
- Athlete marketplace order history and athlete payments must read server-backed order, receipt, and billing state, not direct client table guesses.
- After athlete marketplace purchase or cart checkout, order and receipt state must appear on the athlete order/payments surfaces after refresh and on the Stripe return path.
- Athlete org/team participation surfaces remain hidden in current launch mode unless explicitly reopened.

## Marketplace

- Coach marketplace drafts must save even when the user is not publishing yet.
- Product create and update failures must return the real cause, including missing schema guidance when relevant.
- Publishing rules must still require the proper Stripe and plan checks.

## Coach Experience

- Coach availability must be editable after creation.
- Coach availability UI must use a 12-hour clock, not military time.
- Coach profile session and pricing cards on the public coach page must be actionable and open the booking flow.
- The coach public profile must show next availability from saved calendar availability.
- If no certifications or credibility content exists, that section must not render on the public coach profile.
- Grades coached must not render on the public coach profile when levels and ages already cover that information.

## UI And Branding

- The shared logo must use the transparent asset on both web and mobile.
- Social preview image must come from `public/og-home.jpg`.
- The hero carousel must keep cycling through all four clips without stalling on one clip.
- The modal overlay must dim the full page, including the header, and sit above the header.
- Mobile settings pages must expose the same section-jump navigation capability as desktop.

## Content Policy

- No sample or demo data may appear in live portal experiences.
- Empty states are allowed; fake contacts, fake reports, fake bookings, fake messages, and fake products are not.
- Test-mode access buttons are allowed only when intentionally enabled for testing.

## How To Add A New Locked Rule

Add a new rule here only after:

1. The user confirms the behavior is now the intended permanent behavior.
2. The flow is verified.
3. Any related tests or verification steps are updated.

Each new rule should be written as a concrete product constraint, not a vague preference.

## Operational Rule

- Any future feature work touching auth, saves, billing, messaging, marketplace, onboarding, or public profiles must be checked against this file before implementation.
