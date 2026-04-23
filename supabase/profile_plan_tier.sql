-- Add plan_tier to profiles — safe to run multiple times.
-- Stores the user's selected plan tier (e.g. 'starter', 'pro', 'elite' for coaches;
-- 'explore', 'train', 'family' for athletes) directly on the profile row.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_tier TEXT;

-- Backfill existing rows from the plans tables.
UPDATE profiles p
SET plan_tier = c.tier
FROM coach_plans c
WHERE c.coach_id = p.id AND p.plan_tier IS NULL;

UPDATE profiles p
SET plan_tier = a.tier
FROM athlete_plans a
WHERE a.athlete_id = p.id AND p.plan_tier IS NULL;
