# Browser State Audit

This audit covers the strict pass requested for:

- favorite/save actions
- dismissals
- draft-like flows

The goal is to distinguish:

- platform-significant state that must be backend-backed
- acceptable browser-only cache or device-local UI state
- optional future upgrades that are not current rule violations

## Summary

There are no remaining must-fix violations in the audited categories for the current rule set.

The important user-visible writes in these areas are backend-backed:

- saved coaches
- marketplace preferences and history
- marketplace cart sync
- onboarding progress
- reviews
- product draft/publish states
- profile/settings saves

What remains browser-only is either:

- cache/fallback
- ephemeral UI dismissal state
- unsaved compose/draft state that is not currently promised to survive refresh or device changes

## Favorite / Save Actions

These are correctly backend-backed and do not need cleanup:

- `src/app/athlete/discover/page.tsx`
  Notes: saved coaches load and persist through `src/app/api/athlete/saved-coaches/route.ts`
- `src/app/athlete/marketplace/page.tsx`
  Notes: recent searches, saved items, and recently viewed sync through `src/app/api/athlete/marketplace-preferences/route.ts`; cart syncs through `src/app/api/athlete/cart/route.ts`
- `src/app/athlete/marketplace/product/[id]/page.tsx`
  Notes: product-detail cart actions and recently viewed state sync through the same marketplace/cart backend paths
- `src/app/coach/settings/page.tsx`
  Notes: coach profile/settings saves go through `src/app/api/profile/save/route.ts`; `localStorage` here is cache only
- `src/app/athlete/settings/page.tsx`
  Notes: profile, guardian, emergency, notification, privacy, communication, autopay, and integration settings save through backend paths
- `src/app/org/settings/page.tsx`
  Notes: org settings save through `src/app/api/org/settings/route.ts`
- `src/app/org/permissions/page.tsx`
  Notes: role permission changes save through backend APIs
- `src/app/org/notes/page.tsx`
  Notes: notes save through `src/app/api/org/notes/route.ts`
- `src/app/athlete/profiles/[slug]/page.tsx`
  Notes: coach notes, performance metrics, results, and media inserts persist to Supabase-backed tables
- `src/app/coach/marketplace/create/page.tsx`
  Notes: draft and publish actions persist through `src/app/api/coach/products/route.ts`
- `src/app/coach/marketplace/product/[slug]/edit/page.tsx`
  Notes: edit and draft/publish changes persist through `src/app/api/coach/products/[id]/route.ts`
- `src/app/org/marketplace/create/page.tsx`
  Notes: draft and publish actions persist through org marketplace product APIs
- `src/app/org/marketplace/product/[id]/edit/page.tsx`
  Notes: edit and draft/publish changes persist through org marketplace product APIs

## Dismissals

These are correctly backend-backed and do not need cleanup:

- `src/app/athlete/dashboard/page.tsx`
- `src/app/coach/dashboard/page.tsx`
- `src/app/guardian/dashboard/page.tsx`
- `src/app/org/page.tsx`

Notes:

- onboarding modal dismissal is backend-backed
- `localStorage` is only fallback/cache for modal visibility

These are browser-only but acceptable as cosmetic or ephemeral UI state:

- billing banners dismissed in `src/app/athlete/dashboard/page.tsx`
- billing banners dismissed in `src/app/coach/dashboard/page.tsx`
- billing banners dismissed in `src/app/org/page.tsx`
- toast close actions across the app
- modal open/close state that does not represent account progress

These do not need backend persistence unless product requirements change to "dismiss once across devices."

## Draft-Like Flows

These are correctly backend-backed and do not need cleanup:

- marketplace product drafts in coach and org create/edit flows

These are browser-memory only and currently acceptable:

- unsent message composers in `src/app/athlete/messages/page.tsx`
- unsent message composers in `src/app/coach/messages/page.tsx`
- unsent message composers in `src/app/org/messages/page.tsx`
- unsent support forms in `src/app/support/page.tsx`
- unsent support forms in `src/app/athlete/support/page.tsx`
- unsent support forms in `src/app/coach/support/page.tsx`
- unsent support forms in `src/app/org/support/page.tsx`

Notes:

- these pages do submit to real backend routes once the user sends
- they do not currently persist draft text across refresh/device
- this is not a current rule violation because the product does not promise draft recovery

## Exact Pages That Still Need Cleanup

No pages in this audit currently require cleanup to satisfy the active rule:

`platform-significant writes must be backend-backed, and localStorage should be cache only unless the state is intentionally device-local`

## Optional Future Upgrades

If product requirements change and you want durable draft recovery, the first pages to upgrade are:

- `src/app/athlete/messages/page.tsx`
- `src/app/coach/messages/page.tsx`
- `src/app/org/messages/page.tsx`
- `src/app/support/page.tsx`
- `src/app/athlete/support/page.tsx`
- `src/app/coach/support/page.tsx`
- `src/app/org/support/page.tsx`

That would be a product enhancement, not a remediation fix.
