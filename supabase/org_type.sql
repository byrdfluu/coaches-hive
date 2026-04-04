-- Add org_type to organizations to distinguish school/institution orgs
-- (no athlete payments) from all other org types (athlete-paid sessions).
--
-- org_type values:
--   'school'       — institution/school; sessions are sponsored, no athlete payments at booking
--   'club'         — club org; athletes pay per session/program (8% platform fee)
--   'travel'       — travel organization; athletes pay per trip/program
--   'academy'      — private training academy; athletes pay per session
--   'organization' — generic fallback

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_type text NOT NULL DEFAULT 'club'
    CHECK (org_type IN ('school', 'club', 'travel', 'academy', 'organization'));

COMMENT ON COLUMN public.organizations.org_type IS
  'Determines billing model: school = institution-sponsored (no athlete payments at booking); all others = athlete-paid sessions with 8% platform fee.';
