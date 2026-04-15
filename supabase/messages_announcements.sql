-- Migration: message soft-delete/edit columns + org announcements table
-- Run this in the Supabase SQL editor before deploying messaging features.

-- ─── 1. Soft-delete and edit tracking on messages ────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index so queries filtering out deleted messages stay fast
CREATE INDEX IF NOT EXISTS messages_deleted_at_idx
  ON public.messages (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ─── 2. Org announcements ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.org_announcements (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES public.organizations(id)  ON DELETE CASCADE,
  title      text        NOT NULL,
  body       text        NOT NULL,
  audience   text        NOT NULL DEFAULT 'All',
  created_by uuid        NOT NULL REFERENCES public.profiles(id)       ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_announcements_org_id_idx
  ON public.org_announcements (org_id);

CREATE INDEX IF NOT EXISTS org_announcements_created_at_idx
  ON public.org_announcements (created_at DESC);

ALTER TABLE public.org_announcements ENABLE ROW LEVEL SECURITY;

-- All org members can read announcements for their org
DROP POLICY IF EXISTS "org_announcements_select_member" ON public.org_announcements;
CREATE POLICY "org_announcements_select_member"
  ON public.org_announcements
  FOR SELECT
  USING (
    (auth.jwt() ->> 'role') = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.org_id = org_announcements.org_id
        AND m.user_id = auth.uid()
    )
  );

-- Only org admin roles can create announcements
DROP POLICY IF EXISTS "org_announcements_insert_admin" ON public.org_announcements;
CREATE POLICY "org_announcements_insert_admin"
  ON public.org_announcements
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.org_id = org_announcements.org_id
        AND m.user_id = auth.uid()
        AND m.role IN (
          'org_admin', 'school_admin', 'athletic_director',
          'program_director', 'club_admin', 'travel_admin'
        )
    )
  );
