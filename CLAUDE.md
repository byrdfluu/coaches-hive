# CLAUDE.md — Coaches Hive (CHMain)

This file provides context for AI assistants (Claude, ChatGPT, etc.) to stay consistent with project conventions.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.2.35 (App Router) |
| Language | TypeScript 5.2 |
| Styling | Tailwind CSS v3.3 |
| Database / Auth | Supabase (PostgreSQL + RLS + Supabase Auth) |
| Payments | Stripe |
| Email | Postmark (templates) + Gmail API |
| Error Tracking | Sentry |
| Testing | Playwright (E2E) |
| Icons | Lucide React |
| Runtime | Node.js 20 in CI, Node.js 18+ locally |

---

## Folder Structure

```
chmain/CHMain/
├── src/
│   ├── app/                  # Next.js App Router — pages and API routes
│   │   ├── api/              # API route handlers (kebab-case folder names)
│   │   ├── admin/            # Admin portal pages
│   │   ├── coach/            # Coach portal pages
│   │   ├── athlete/          # Athlete portal pages
│   │   └── org/              # Organization portal pages
│   ├── components/           # Shared React components (PascalCase filenames)
│   └── lib/                  # Utilities, config, business logic (camelCase filenames)
├── supabase/                 # DB migrations and SQL scripts
├── tests/                    # Playwright E2E tests
├── docs/                     # Documentation
└── scripts/                  # Build and automation scripts
```

`chmain/CHMain` is the maintained application. The parent `chmain/package.json` and workspace-root `package.json` only proxy commands into it. Do not treat `coachhive/`, `CoachesHive/Figma/*`, or the workspace-root `src/` tree as the active app.

---

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `AdminSidebar.tsx` |
| Lib / Utilities | camelCase | `authVerification.ts` |
| API route folders | kebab-case | `guardian-links/` |
| Types / Interfaces | No prefix | `GuardianApprovalScope` |
| Constants | UPPER_SNAKE_CASE | `ADMIN_TEAM_ROLES` |
| Imports | Use `@/` alias | `import { x } from '@/lib/email'` |

---

## Do Not Break These Files

These files are foundational. Changes here can break auth, payments, or core workflows across the entire platform. Read carefully before editing.

### Auth & Security
- `src/middleware.ts` — middleware entrypoint and request orchestration
- `src/lib/apiAuth.ts` — API route authentication handler
- `src/lib/authVerification.ts` — email verification / OTP delivery
- `src/lib/adminRoles.ts` — admin permission definitions
- `src/lib/guardianApproval.ts` — guardian approval workflows
- `src/lib/sessionRoleState.ts` — canonical session role, tier, lifecycle, and admin access decoding
- `src/lib/middlewarePolicy.ts` — middleware route tables and permission maps
- `src/lib/middlewareEnforcement.ts` — shared middleware enforcement logic for account, lifecycle, billing, admin, and org policies

### Database
- `src/lib/supabaseAdmin.ts` — Supabase admin client (server-only)
- `src/lib/supabaseClient.ts` — Supabase browser client

### Payments
- `src/lib/stripeServer.ts` — Stripe server instance
- `src/app/api/payments/intent/` — payment intent creation
- `src/app/api/payments/refund/` — refund handling

### Core Business Logic
- `src/lib/lifecycleOrchestration.ts` — user lifecycle state machine
- `src/lib/operations.ts` — operation tracking and control system

---

## Critical Flows — Do Not Break

These are the highest-risk user journeys. Every change that touches auth, payments, guardian logic, or signup must be manually verified (or covered by the Playwright tests in `tests/`) against each flow before merging.

### 1. Athlete signup → email verification → dashboard
- User fills signup form, selects "I'm an Athlete", submits
- Redirected to `/auth/verify?role=athlete&...`
- Enters verification code → redirected to `/athlete/onboarding` or `/athlete/dashboard`
- **Protect:** `src/app/signup/page.tsx`, `src/app/api/auth/signup/route.ts`, `src/app/auth/verify/`, `src/middleware.ts`

### 2. Guardian invite → accept → guardian dashboard
- Athlete signs up as minor with a guardian email → invite email sent via Postmark
- Guardian opens `/guardian/accept-invite?token=...` → form shown with athlete name + read-only email
- Guardian submits name + password → redirected to `/auth/verify?role=guardian`
- After verification → `/guardian/dashboard` shows linked athlete
- **Protect:** `src/app/api/guardian-invites/route.ts`, `src/app/guardian/accept-invite/page.tsx`, `src/lib/inviteDelivery.ts`
- **Invariant:** A guardian account can only be created via this invite flow — self-signup as "guardian" is not possible

### 3. Guardian approval gate
- Athletes marked as minors go through `guardianApproval.ts` for messaging, transactions, and other gated actions
- Guardian sees pending approvals on `/guardian/dashboard` and `/guardian/approvals`
- Approving/denying updates `guardian_approvals` table and unblocks or rejects the action
- **Protect:** `src/lib/guardianApproval.ts`, `src/app/api/guardian-approvals/route.ts`

### 4. Marketplace cart → Stripe checkout
- Athlete adds products to cart (localStorage key `athlete-marketplace-cart`)
- Cart page at `/athlete/marketplace/cart` reads items and shows totals
- "Checkout" calls `POST /api/stripe/cart-checkout` → receives `{ url }` → redirects to Stripe
- **Protect:** `src/app/api/stripe/cart-checkout/route.ts`, `src/app/api/stripe/webhook/route.ts`

### 5. Waiver signing → download record
- Pending waivers appear at `/athlete/waivers`
- Athlete clicks "Review & sign", enters full name, checks consent checkbox, clicks "Sign waiver"
- Sign button is **disabled** until both name and checkbox are filled
- On success, waiver moves to "Signed" section with a "Download record" link → `/api/waivers/[id]/signed-record`
- **Protect:** `src/app/athlete/waivers/page.tsx`, `src/app/api/waivers/sign/route.ts`, `src/app/api/waivers/[id]/signed-record/route.ts`

### 6. Onboarding modal
- New users see the modal on first visit to their dashboard (localStorage key `ch_onboarding_[role]_v1` not set)
- Modal shows: role-specific steps, emoji icon per step, progress dots, per-step action links
- Last step shows green "Get started →" button
- Dismissing (Skip or finishing) sets the localStorage key → modal does not show again
- **Protect:** `src/components/OnboardingModal.tsx`

---

## Running E2E Tests

```bash
npx playwright test          # run all tests headless
npx playwright test --ui     # open Playwright UI mode
npx playwright test smoke    # run smoke tests only
```

The suite is E2E-heavy. Some specs use `page.route()` or request-level assertions to validate unauthenticated and validation contracts without live accounts, while credential-backed flows use optional `E2E_*` env vars from `.env.local`. Set `baseURL` in `playwright.config.ts` (default: `http://localhost:3000`).

---

## Commit Message Style

Imperative, present tense. Match the existing repo history:

```
Wire <feature or area>
Fix <what was broken>
Harden <what was tightened>
Add <new thing>
Consolidate <what was merged/unified>
```

**Examples:**
- `Wire admin churn metrics and harden admin UI runtime`
- `Fix verify link handling and mobile org overview overlap`
- `Harden signup flow and return actionable auth errors`
- `Add coach reports drilldowns and calendar sample data`

---

## PR Guidelines

- **Title**: same format as commit message
- **Body**: bullet list of what changed and why
- One concern per PR when possible
- Do not mix refactors with feature work
- Do not commit `.env.local` or any secrets

---

## Engineering Rules

### User-Visible Writes Must Be Real

Any user-visible write must have a real save path:

`UI -> API/server action -> Supabase/Stripe -> test`

If the UI tells the user they saved, updated, dismissed, reviewed, approved, favorited, or purchased something, that action must go through a real server path and durable system of record. Do not leave platform-significant writes in browser-only state.

`localStorage` is cache only unless the behavior is intentionally device-local.
