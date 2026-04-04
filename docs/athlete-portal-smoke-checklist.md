# Athlete Portal Smoke Checklist

Use this checklist for live athlete-portal verification before rollout changes are considered complete.

## Account And Routing

- Sign in as an athlete and confirm the first landing page is the athlete portal, not public marketing or another portal.
- Open [dashboard](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/athlete/dashboard/page.tsx), [discover](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/athlete/discover/page.tsx), [calendar](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/athlete/calendar/page.tsx), [messages](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/athlete/messages/page.tsx), [marketplace](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/athlete/marketplace/page.tsx), [payments](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/athlete/payments/page.tsx), [waivers](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/athlete/waivers/page.tsx), and [settings](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/athlete/settings/page.tsx) and confirm they render without redirects or broken shells.
- Confirm [orgs-teams](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/athlete/orgs-teams/page.tsx) is hidden in current launch mode and direct access redirects away.

## Discover And Connection

- Search for a known coach and confirm the card appears in Discover.
- Open a coach profile from Discover and confirm it stays inside the athlete portal shell.
- Save a coach, refresh, and confirm the saved state persists.
- Remove a saved coach, refresh, and confirm it stays removed.
- Send a coach invite and confirm recent invite history reloads in the modal.

## Booking And Calendar

- Book from the coach profile flow and confirm the athlete can continue to payment.
- Book from the athlete calendar flow and confirm the same coach/time appears correctly.
- Confirm in-person booking location prefills from the coach’s configured location.
- For minor/guardian-managed athletes, confirm guardian approval either blocks or allows booking correctly.
- After a successful booking, confirm the session appears in the athlete calendar.

## Messaging And Notes

- Open athlete messages and confirm linked coaches appear as available recipients.
- Start a thread, send a message, refresh, and confirm the thread/message persist.
- Send an attachment and confirm it appears in the thread.
- Confirm read/delivered indicators update after reload.
- Save an athlete-authored note, refresh, and confirm it persists.

## Marketplace And Payments

- Add a marketplace item to cart, refresh, and confirm the cart persists.
- Complete a single marketplace purchase and confirm the order appears in [marketplace/orders](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/athlete/marketplace/orders/page.tsx).
- Complete a cart checkout and confirm the order/receipt state refreshes automatically after the Stripe return.
- Open [payments](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/athlete/payments/page.tsx) and confirm:
  - athlete subscription tier/status matches Stripe-backed billing state
  - saved cards are listed
  - marketplace receipts and session payments appear in history

## Family, Waivers, And Safety

- Save guardian info and confirm the settings page shows either `Invite pending` or `Linked`.
- If a guardian accepts the invite, refresh settings and confirm the guardian moves from pending to linked.
- Save emergency contacts and confirm they persist after refresh.
- Sign a waiver and confirm it moves from pending to signed with a downloadable record.

## Completion Standard

- `npm run lint`
- `npm run build`
- Manual completion of the checklist sections touched by the change
- Update [docs/locked-behavior.md](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/docs/locked-behavior.md) if any approved athlete behavior becomes frozen
