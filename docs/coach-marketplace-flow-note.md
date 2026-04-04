# Coach Marketplace Flow Note

This note documents the current coach marketplace save flow, with emphasis on product-type handling, draft expectations, and schema assumptions.

## Current Behavior

- The coach create page at `src/app/coach/marketplace/create/page.tsx` collects product data in the UI, uploads media to Supabase Storage bucket `product-media`, and then posts the saved payload to `POST /api/coach/products`.
- The edit page at `src/app/coach/marketplace/product/[slug]/edit/page.tsx` follows the same pattern: optional media upload first, then `PATCH /api/coach/products/[id]`.
- Product `type` is now single-select in the UI. The API defensively normalizes any comma-delimited legacy input down to the first canonical type before writing `products.type`.
- Draft and published products use the same save path. Drafts are allowed to omit publish-only fields; published products must supply the full set of required fields.

## Save-Draft Expectations

- Draft saves should still persist a product row even if the product schema is partially deployed.
- The API supports a fallback minimal draft insert/update when optional marketplace columns are missing.
- Drafts still need a title and type, but they do not require the published-only fields such as price, refund policy, format, description, or media.
- Publishing is gated by Stripe connection and plan eligibility on the client and by Stripe/plan checks on the server.

## Schema Assumptions

- The product table is expected to support at least these fields: `title`, `type`, `status`, `price`, `sale_price`, `discount_label`, `price_label`, `format`, `duration`, `next_available`, `includes`, `refund_policy`, `description`, `media_url`, and `coach_id`.
- `products.type` is constrained by `products_type_check`, so the save path must only write canonical allowed values. If the database still rejects drafts, the existing constraint is stale and needs to be aligned with the single-select type set.
- The server explicitly calls out migration dependencies when optional columns are missing: `products_price.sql`, `products_description_media.sql`, and `products_refund_discounts.sql`.
- The `product-media` bucket is expected to exist and be public for previewing uploaded media.
- Published saves require a connected Stripe account and a plan that allows marketplace publishing.

## Changelog Note

- The marketplace flow is intentionally split into draft-friendly and publish-only validation. Product type is single-select in the UI, and the API normalizes legacy comma-delimited input to the first canonical value before saving.
