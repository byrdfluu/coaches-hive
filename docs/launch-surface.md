# Launch Surface

This repo is currently operating in a coach-and-athlete-first launch mode.

## Live Public Surface

- Home page: `/`
- Coach public landing: `/coach`
- Athlete public landing: `/athlete`
- Public pricing: coach and athlete plans only
- Coach signup, verification, checkout, dashboard
- Athlete signup, verification, checkout, dashboard
- Coach discovery, profile, availability, booking, messaging, and payments
- Athlete discovery, booking, messaging, and payments

## Hidden For Later

These areas remain in the codebase but are intentionally not part of the public live product:

- Public org marketing and org entry pages
- Org pricing on the public pricing page
- Coach-to-org conversion as a public launch path
- Org signup and org billing as a public launch path
- Guardian flows as a public launch path

## Launch Rules

- Public CTAs should route only into coach or athlete acquisition flows.
- Org and guardian code can stay in the repo, but should be treated as private beta surfaces until explicitly re-enabled.
- Proof-of-product testing should stay focused on coach and athlete end-to-end flows:
  - signup
  - verification
  - plan selection
  - checkout
  - dashboard
  - booking
  - messaging
  - payments

## Re-Enable Gates

Do not re-open public org entry until coach and athlete flows repeatedly pass on live without:

- manual Supabase data repair
- manual Stripe cleanup
- redirect/lifecycle loops
- portal shell leakage into public layouts
