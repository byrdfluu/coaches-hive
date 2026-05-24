-- Persist seller context on transactions so fee attribution and receipt display
-- can distinguish personal coach sales from org sales without re-deriving from coach_id/org_id.

ALTER TABLE session_payments
  ADD COLUMN IF NOT EXISTS seller_type text DEFAULT 'coach' CHECK (seller_type IN ('coach', 'org')),
  ADD COLUMN IF NOT EXISTS seller_id uuid;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS seller_type text DEFAULT 'coach' CHECK (seller_type IN ('coach', 'org')),
  ADD COLUMN IF NOT EXISTS seller_id uuid;

ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS seller_type text DEFAULT 'coach' CHECK (seller_type IN ('coach', 'org')),
  ADD COLUMN IF NOT EXISTS seller_id uuid;
