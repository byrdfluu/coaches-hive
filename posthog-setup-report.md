<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Coaches Hive Next.js application. PostHog is initialized via `src/instrumentation-client.ts` (the Next.js 15.3+ instrumentation pattern) alongside the existing Sentry setup, routed through an `/ingest` proxy in `next.config.js` to avoid ad-blocker interference. User identification runs through a new `PostHogIdentify` component mounted in the root layout, which mirrors the existing `MixpanelProvider` pattern using Supabase auth state changes. A server-side PostHog client (`src/lib/posthog-server.ts`) is used in API routes to capture business-critical events that can't be tracked client-side. All PostHog server-side tracking is additive alongside the existing Mixpanel tracking.

| Event | Description | File |
|---|---|---|
| `signup_form_submitted` | User submits the signup form (client-side, after successful API response) | `src/app/signup/page.tsx` |
| `email_verified` | User successfully verifies their email — PostHog `identify` is called here | `src/app/auth/verify/page.tsx` |
| `user_signed_up` | Server confirms new account created; server-side `identify` called | `src/app/api/auth/signup/route.ts` |
| `cart_checkout_initiated` | Athlete clicks checkout for all cart items | `src/app/athlete/marketplace/cart/page.tsx` |
| `cart_item_removed` | Athlete removes an individual item from the cart | `src/app/athlete/marketplace/cart/page.tsx` |
| `waiver_signed` | Athlete signs a waiver (client-side, after successful API response) | `src/app/athlete/waivers/page.tsx` |
| `waiver_signed` | Server confirms waiver signature recorded in database | `src/app/api/waivers/sign/route.ts` |
| `cart_checkout_session_created` | Stripe checkout session created for a marketplace cart | `src/app/api/stripe/cart-checkout/route.ts` |
| `subscription_checkout_initiated` | Stripe subscription checkout session created | `src/app/api/stripe/subscription/checkout/route.ts` |
| `onboarding_completed` | User completes all onboarding steps | `src/app/api/onboarding/route.ts` |
| `subscription_activated` | Stripe webhook confirms subscription is active | `src/app/api/stripe/webhook/route.ts` |
| `marketplace_order_paid` | Stripe webhook confirms marketplace cart payment | `src/app/api/stripe/webhook/route.ts` |
| `subscription_churned` | Stripe webhook reports subscription cancelled or deleted | `src/app/api/stripe/webhook/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/381159/dashboard/1463805
- **Signup Conversion Funnel** (funnel: form → verified → checkout): https://us.posthog.com/project/381159/insights/QLMDENiK
- **Subscription Activations vs Churn** (weekly trend): https://us.posthog.com/project/381159/insights/up7eB06O
- **Marketplace Orders (Daily)**: https://us.posthog.com/project/381159/insights/6tlNyFmP
- **New Signups by Role** (breakdown by coach/athlete): https://us.posthog.com/project/381159/insights/LGhZIax4
- **Waivers Signed & Onboarding Completed** (weekly trend): https://us.posthog.com/project/381159/insights/Wuq3HttR

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
