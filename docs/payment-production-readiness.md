# Payment production readiness

All amounts are integer cents. Prices, fees, destinations, workspace ownership, and entitlements are server-authoritative. Browser redirects never complete payments; only signed Stripe webhooks do.

## Required Stripe webhook events

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.requires_action`
- `payment_intent.canceled`
- `charge.succeeded`
- `charge.refunded`
- `charge.refund.updated`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `customer.subscription.trial_will_end`
- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `payment_method.updated`
- `account.updated`

Production URL: `https://app.coacheshive.com/api/stripe/webhook`.

## Operational verification

Before enabling production collections, verify the endpoint events above in Stripe, set `STRIPE_WEBHOOK_SECRET`, `STRIPE_RECURRING_FEES_PORTAL_CONFIGURATION_ID`, `COACHES_HIVE_PLATFORM_FEE_BPS=400`, all Stripe price IDs, and the Apple verification variables in `.env.example`. Run a real Stripe test-mode matrix for card and ACH, success/failure/cancel, duplicate and out-of-order webhooks, partial/full/failed refunds, disputes, Connect not-ready and wrong-recipient attempts, recurring retries/pause/cancel, and duplicate checkout requests. Verify database ledger, receipt, entitlement/fulfillment, and seller net after each case.

Webhook failures are recorded in `stripe_webhook_events` and queued in `operation_tasks` as `webhook_replay`. Operations monitoring must alert on failed/dead-letter records. Stripe reconciliation remains review-only and must not silently mutate financial state.
