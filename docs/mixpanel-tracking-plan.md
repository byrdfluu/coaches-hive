# Mixpanel Tracking Plan

This document defines the canonical event names and core properties for Mixpanel in Coaches Hive.

## Environment Variables

- Client-side tracking uses `NEXT_PUBLIC_MIXPANEL_TOKEN`.
- Server-side tracking should use `MIXPANEL_PROJECT_TOKEN`.
- Server-side tracking falls back to `NEXT_PUBLIC_MIXPANEL_TOKEN` if `MIXPANEL_PROJECT_TOKEN` is not set, so deploys do not break during migration.
- The Mixpanel API secret is not required for the event tracking implemented in this app.

## Conventions

- Use title-case event names exactly as listed below.
- Keep revenue values in decimal USD, not cents.
- Treat `platform_revenue` as Coaches Hive revenue.
- Treat `platform_net_profit_estimate` as a provisional profit proxy, not full accounting profit.
- Use `coach_revenue` and `org_revenue` for seller-side gross netted amounts.
- Use `distinct_id` as:
  - user ID for user actions
  - `org:<org_id>` for org-level revenue/payout events
  - coach user ID for coach-side revenue/payout events

## Identity

### User profile

Set on identify / people updates:

- `$email`
- `$name`
- `role`
- `active_role`
- `created_at`

### Registered super properties

- `user_id`
- `role`
- `active_role`

## Client Events

### `Page Viewed`

When:
- On route change after Mixpanel init

Properties:
- `path`
- `search`
- `url`
- `title`
- `referrer`

### `Signed In`

When:
- Supabase auth state changes to signed in

Properties:
- `role`
- `active_role`

### `Signed Out`

When:
- Supabase auth state changes to signed out

Properties:
- `path`

## Conversion Events

### `Subscription Activated`

When:
- Stripe confirms a completed subscription checkout in the webhook

Properties:
- `billing_role`
- `tier`
- `org_id`
- `user_id`
- `customer_id`
- `subscription_id`
- `subscription_status`
- `gross_revenue`
- `platform_revenue`
- `platform_net_profit_estimate`
- `currency`

Notes:
- This is the primary paid conversion event for coach, athlete, and org subscriptions.

### `Coach Listing Created`

When:
- Coach marketplace product is created

Properties:
- `coach_id`
- `product_id`
- `title`
- `status`
- `category`
- `product_type`
- `gross_revenue`
- `marketplace_sales`
- `is_published`

### `Org Listing Created`

When:
- Org marketplace product is created

Properties:
- `org_id`
- `actor_user_id`
- `product_id`
- `title`
- `status`
- `product_type`
- `gross_revenue`
- `marketplace_sales`
- `is_published`

### `Session Booked`

When:
- A booking record is successfully created

Properties:
- `session_id`
- `coach_id`
- `athlete_id`
- `org_id`
- `actor_role`
- `session_type`
- `title`
- `start_time`
- `status`
- `gross_revenue`
- `platform_revenue`
- `platform_net_profit_estimate`
- `coach_revenue`
- `is_paid`
- `currency`

### `Marketplace Order Paid`

When:
- Marketplace purchase succeeds through direct order flow or cart Stripe webhook

Properties:
- `order_id`
- `product_id`
- `coach_id`
- `org_id`
- `seller_type`
- `checkout_source`
- `gross_revenue`
- `marketplace_sales`
- `platform_revenue`
- `platform_net_profit_estimate`
- `seller_revenue`
- `coach_revenue`
- `org_revenue`
- `currency`
- `status`

## Revenue Events

### `Session Revenue Recorded`

When:
- Paid booking inserts a `session_payments` row

Properties:
- `session_id`
- `session_payment_id`
- `coach_id`
- `athlete_id`
- `org_id`
- `gross_revenue`
- `platform_revenue`
- `platform_net_profit_estimate`
- `coach_revenue`
- `payout_amount`
- `payout_status`
- `currency`

### `Marketplace Revenue Recorded`

When:
- Marketplace order is written successfully

Properties:
- `order_id`
- `product_id`
- `coach_id`
- `org_id`
- `seller_type`
- `checkout_source`
- `gross_revenue`
- `marketplace_sales`
- `platform_revenue`
- `platform_net_profit_estimate`
- `seller_revenue`
- `coach_revenue`
- `org_revenue`
- `currency`
- `status`

### `Org Revenue Recorded`

When:
- Organization fee assignment is marked paid

Properties:
- `org_id`
- `athlete_id`
- `fee_assignment_id`
- `fee_title`
- `gross_revenue`
- `org_revenue`
- `platform_revenue`
- `platform_net_profit_estimate`
- `currency`
- `status`

### `Subscription Revenue Recorded`

When:
- Stripe invoice payment succeeds

Properties:
- `billing_role`
- `tier`
- `customer_id`
- `subscription_id`
- `gross_revenue`
- `platform_revenue`
- `platform_net_profit_estimate`
- `currency`
- `invoice_id`
- `subscription_status`

## Payout Events

### `Payout Paid`

When:
- Stripe Connect webhook receives `payout.paid`

Properties:
- `seller_type`
- `coach_id`
- `org_id`
- `payout_id`
- `amount`
- `currency`
- `arrival_date`
- `status`

### `Payout Failed`

When:
- Stripe Connect webhook receives `payout.failed`

Properties:
- `seller_type`
- `coach_id`
- `org_id`
- `payout_id`
- `amount`
- `currency`
- `arrival_date`
- `status`

## Churn Events

### `Subscription Cancellation Requested`

When:
- User explicitly cancels subscription from the app

Properties:
- `billing_role`
- `user_id`
- `org_id`

### `Subscription Status Changed`

When:
- Stripe webhook updates subscription state

Properties:
- `billing_role`
- `tier`
- `user_id`
- `org_id`
- `customer_id`
- `subscription_id`
- `subscription_status`

### `Subscription Churned`

When:
- Subscription status becomes canceled or Stripe deletes it

Properties:
- `billing_role`
- `tier`
- `user_id`
- `org_id`
- `customer_id`
- `subscription_id`
- `subscription_status`
- `churn_type`

### `Subscription Payment Failed`

When:
- Stripe invoice payment fails

Properties:
- `billing_role`
- `tier`
- `customer_id`
- `subscription_id`
- `gross_revenue`
- `platform_revenue`
- `platform_net_profit_estimate`
- `currency`
- `invoice_id`
- `subscription_status`

## Suggested Mixpanel Reports

### Core funnels

- `Signed In` -> `Subscription Activated`
- `Signed In` -> `Coach Listing Created` -> `Marketplace Revenue Recorded`
- `Signed In` -> `Session Booked` -> `Session Revenue Recorded`

### Revenue insights

Break down by:

- `billing_role`
- `tier`
- `seller_type`
- `checkout_source`
- `coach_id`
- `org_id`

Use these events:

- `Subscription Revenue Recorded`
- `Session Revenue Recorded`
- `Marketplace Revenue Recorded`
- `Org Revenue Recorded`

### Churn dashboard

Use:

- `Subscription Cancellation Requested`
- `Subscription Churned`
- `Subscription Payment Failed`
- `Subscription Status Changed`

## Current Source Files

- [MixpanelProvider.tsx](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/components/MixpanelProvider.tsx)
- [mixpanelServer.ts](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/lib/mixpanelServer.ts)
- [bookings/route.ts](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/api/bookings/route.ts)
- [marketplace/orders/route.ts](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/api/marketplace/orders/route.ts)
- [stripe/webhook/route.ts](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/api/stripe/webhook/route.ts)
- [stripe/connect-webhook/route.ts](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/api/stripe/connect-webhook/route.ts)
- [account/subscription/cancel/route.ts](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/api/account/subscription/cancel/route.ts)
- [coach/products/route.ts](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/api/coach/products/route.ts)
- [org/products/route.ts](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/api/org/products/route.ts)
- [athlete/charges/pay/route.ts](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/api/athlete/charges/pay/route.ts)
- [org/charges/pay/route.ts](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/api/org/charges/pay/route.ts)
