-- Coach Programs + Exercise Builder
-- Run this in Supabase SQL Editor

-- ──────────────────────────────────────────
-- 1. coach_exercises
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_exercises (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  category         text,
  modality         text,
  muscle_group     text,
  movement_pattern text,
  instructions     text,
  video_url        text,
  tracking_fields  jsonb NOT NULL DEFAULT '["Reps"]'::jsonb,
  photo_paths      jsonb NOT NULL DEFAULT '[]'::jsonb,
  thumbnail_path   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coach_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_exercises_coach_all"
  ON coach_exercises FOR ALL
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

-- ──────────────────────────────────────────
-- 2. coach_programs
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_programs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES products(id) ON DELETE SET NULL,
  title          text NOT NULL,
  description    text,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
  duration_label text,
  thumbnail_path text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coach_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_programs_coach_all"
  ON coach_programs FOR ALL
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "coach_programs_athlete_select"
  ON coach_programs FOR SELECT
  USING (
    product_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.product_id = coach_programs.product_id
        AND o.athlete_id = auth.uid()
        AND o.status IN ('paid', 'active', 'approved')
    )
  );

-- ──────────────────────────────────────────
-- 3. coach_program_exercises
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_program_exercises (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  uuid NOT NULL REFERENCES coach_programs(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES coach_exercises(id) ON DELETE CASCADE,
  coach_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position    integer NOT NULL DEFAULT 0,
  sets        integer,
  reps        text,
  rest_seconds integer,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, exercise_id)
);

ALTER TABLE coach_program_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpe_coach_all"
  ON coach_program_exercises FOR ALL
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "cpe_athlete_select"
  ON coach_program_exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM coach_programs cp
      JOIN orders o ON o.product_id = cp.product_id
      WHERE cp.id = coach_program_exercises.program_id
        AND o.athlete_id = auth.uid()
        AND o.status IN ('paid', 'active', 'approved')
        AND cp.product_id IS NOT NULL
    )
  );

-- ──────────────────────────────────────────
-- 4. athlete_exercise_logs
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS athlete_exercise_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id  uuid NOT NULL REFERENCES coach_programs(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES coach_exercises(id) ON DELETE CASCADE,
  coach_id    uuid NOT NULL REFERENCES auth.users(id),
  logged_at   timestamptz NOT NULL DEFAULT now(),
  sets_data   jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ael_athlete_program ON athlete_exercise_logs (athlete_id, program_id);
CREATE INDEX IF NOT EXISTS idx_ael_exercise ON athlete_exercise_logs (exercise_id);

ALTER TABLE athlete_exercise_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ael_athlete_all"
  ON athlete_exercise_logs FOR ALL
  USING (auth.uid() = athlete_id)
  WITH CHECK (auth.uid() = athlete_id);

CREATE POLICY "ael_coach_select"
  ON athlete_exercise_logs FOR SELECT
  USING (auth.uid() = coach_id);

-- ──────────────────────────────────────────
-- updated_at trigger (reuse if function exists)
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER coach_exercises_updated_at
  BEFORE UPDATE ON coach_exercises
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER coach_programs_updated_at
  BEFORE UPDATE ON coach_programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
