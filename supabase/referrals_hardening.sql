-- Referral hardening migration
-- Run in Supabase SQL editor after referrals.sql

-- 1) Remove duplicate referrals for the same referee, keeping the earliest row.
WITH ranked AS (
  SELECT
    id,
    referee_id,
    row_number() OVER (
      PARTITION BY referee_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.referrals
  WHERE referee_id IS NOT NULL
)
DELETE FROM public.referrals r
USING ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

-- 2) Ensure one referral signup per user (null referee_id rows are ignored).
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referee_unique_idx
  ON public.referrals (referee_id)
  WHERE referee_id IS NOT NULL;

-- 3) Add supporting indexes for dashboard query speed.
CREATE INDEX IF NOT EXISTS referrals_referrer_created_idx
  ON public.referrals (referrer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS referrals_status_idx
  ON public.referrals (status);
