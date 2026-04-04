# Coaches Hive

This repository is the maintained Coaches Hive application.

## Source Of Truth

- Active app: `chmain/CHMain`
- Active app: `this repository`
- Wrapper manifest: `../package.json`
- Optional outer workspace wrapper: `../../package.json`

Do all current product, middleware, API, and deployment work from this repo.

## Getting Started

Run the development server from this directory:

```bash
npm run dev
```

Or from the parent wrapper:

```bash
cd ..
npm run dev
```

Open `http://localhost:3000` in your browser.

## Testing

Playwright is the committed test harness.

```bash
npx playwright test
```

Focused middleware and lifecycle coverage lives in:

- `tests/middleware-locked-routes.spec.ts`
- `tests/lifecycle-verification-flow.spec.ts`

## Locked Behavior

Before changing auth, saves, billing, messaging, marketplace, or public profile flows, review [`docs/locked-behavior.md`](./docs/locked-behavior.md). Those behaviors are intentionally locked and should not change without explicit approval.

## Write Path Rule

Any user-visible write must have a real save path:

`UI -> API/server action -> Supabase/Stripe -> test`

If the product lets a user save, dismiss, favorite, review, update, approve, or purchase something, that action must persist through the platform instead of stopping at browser-only state. Treat `localStorage` as cache only unless the data is intentionally device-local.

## Supporting Docs

- Launch surface: [`docs/launch-surface.md`](./docs/launch-surface.md)
- Remediation checklist: [`docs/repo-remediation-checklist.md`](./docs/repo-remediation-checklist.md)
- Middleware audit: [`docs/middleware-deep-dive.md`](./docs/middleware-deep-dive.md)
- API audit: [`docs/api-audit-review.md`](./docs/api-audit-review.md)
- Shared logic audit: [`docs/shared-logic-audit.md`](./docs/shared-logic-audit.md)
- Test coverage review: [`docs/test-coverage-review.md`](./docs/test-coverage-review.md)
- Browser state audit: [`docs/browser-state-audit.md`](./docs/browser-state-audit.md)
- Deployment and secrets review: [`docs/deployment-secrets-review.md`](./docs/deployment-secrets-review.md)

## Removed Duplicate Areas

These duplicate areas were removed during cleanup and should not be recreated as alternate app roots:

- `coachhive/`
- `CoachesHive/Figma/`
- `src/` at the workspace root

## Deployment

Deployment secrets should live in the deployment platform or CI secret manager, not in workspace files. See [`docs/deployment-secrets-review.md`](./docs/deployment-secrets-review.md).
