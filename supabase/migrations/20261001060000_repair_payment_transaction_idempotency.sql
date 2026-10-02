-- PostgREST upserts use stripe_payment_intent_id as their conflict target.
-- A partial unique index cannot be inferred by ON CONFLICT(column), while a
-- regular unique index still permits multiple NULL values in PostgreSQL.

drop index if exists public.payment_transactions_payment_intent_uidx;

create unique index payment_transactions_payment_intent_uidx
  on public.payment_transactions(stripe_payment_intent_id);

notify pgrst, 'reload schema';
