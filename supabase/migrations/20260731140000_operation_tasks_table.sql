-- Operation tasks table replaces the JSONB taskQueue stored in admin_configs.
-- Concurrent-safe INSERT with idempotency key; SELECT FOR UPDATE SKIP LOCKED
-- via the claim_operation_tasks() function prevents double-processing.

CREATE TABLE IF NOT EXISTS operation_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'failed', 'dead_letter', 'completed')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  owner text NOT NULL DEFAULT 'Platform Ops',
  entity_type text,
  entity_id text,
  last_error text,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text UNIQUE,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for the worker query: pick queued tasks in priority + FIFO order
CREATE INDEX IF NOT EXISTS idx_operation_tasks_worker
  ON operation_tasks (priority, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_operation_tasks_idempotency
  ON operation_tasks (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Atomically claim up to p_limit queued tasks for processing.
-- Uses SELECT FOR UPDATE SKIP LOCKED so concurrent workers never claim the same task.
CREATE OR REPLACE FUNCTION claim_operation_tasks(p_limit integer DEFAULT 10)
RETURNS SETOF operation_tasks
LANGUAGE sql
AS $$
  UPDATE operation_tasks
  SET status = 'processing', updated_at = now()
  WHERE id IN (
    SELECT id FROM operation_tasks
    WHERE status = 'queued'
      AND next_run_at <= now()
    ORDER BY
      CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;
