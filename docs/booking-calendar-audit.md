# Booking And Calendar Audit

This audit closes the launch-surface booking review for coach and athlete flows.

## Live booking entry points

- `src/app/coach/[slug]/page.tsx`
- `src/app/athlete/calendar/page.tsx`

These both create real bookings through `src/app/api/bookings/route.ts`.

## Marketplace scope

Marketplace is not a live calendar-booking entry point.

- Session-format marketplace products are purchased through `src/app/api/marketplace/orders/route.ts`
- They create orders and payment receipts, not `sessions`
- Athlete marketplace copy was updated to stop implying an immediate booked calendar slot

## Guardian approval

Guardian approval is enforced in the booking API for athlete transaction flows.

- `src/lib/guardianApproval.ts`
- `src/app/api/bookings/route.ts`

Both athlete booking frontends handle blocked or pending guardian approval correctly:

- `src/app/coach/[slug]/page.tsx`
- `src/app/athlete/calendar/page.tsx`

## Downstream persistence

Successful booking now guarantees:

- session row written to `sessions`
- paid bookings written to `session_payments`
- receipts written to `payment_receipts`
- coach-athlete relationship upserted into `coach_athlete_links`
- direct message thread seeded for the coach-athlete pair if one does not already exist

The message-thread seeding happens in `src/app/api/bookings/route.ts`, so newly booked pairs can immediately use the messages surfaces without needing a manual first-thread creation step.

## Session lifecycle behavior

Reschedule and cancel actions are real server updates through:

- `src/app/api/sessions/[id]/route.ts`

That route already:

- persists reschedules
- persists cancellations
- sends reschedule emails
- sends cancellation emails
- queues refund-review ops tasks for canceled paid sessions

## Reminder behavior

Session reminders are real server-side behavior through:

- `src/app/api/reminders/sessions/route.ts`

This audit tightened reminder eligibility so canceled, cancelled, and completed sessions are excluded from reminder sends.

