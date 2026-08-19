-- profiles.cart was referenced by src/app/api/athlete/cart/route.ts and
-- src/app/api/stripe/cart-checkout/route.ts but was never actually created.
-- Every query against it has been silently failing (both routes ignore the
-- Supabase error return), which made server-side cart persistence and
-- multi-item checkout completely non-functional — cart state has only ever
-- lived in browser localStorage.

alter table public.profiles
  add column if not exists cart jsonb not null default '[]'::jsonb;

comment on column public.profiles.cart is
  'Athlete marketplace cart: array of {id, quantity, price, athlete_profile_id, sub_profile_id, athlete_label, title, creator, mediaUrl, format, duration, priceLabel}. Synced across web and mobile via GET/POST /api/athlete/cart.';
