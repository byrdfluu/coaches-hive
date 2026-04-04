import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { getSessionRoleState } from '@/lib/sessionRoleState'

export const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

export type SessionRole = string | null

export const getSessionRole = async (allowedRoles?: string[]) => {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { supabase, session: null, role: null, error: jsonError('Unauthorized', 401) }
  }

  const roleState = getSessionRoleState(session.user.user_metadata)
  const roleCandidates = Array.from(new Set([
    roleState.currentRole,
    roleState.activeRole,
    roleState.preferredOrgRole,
    ...roleState.availableRoles,
  ].filter(Boolean))) as string[]
  const role = allowedRoles
    ? roleCandidates.find((candidate) => allowedRoles.includes(candidate)) || null
    : roleState.currentRole

  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return { supabase, session, role, error: jsonError('Forbidden', 403) }
  }

  return { supabase, session, role, error: null }
}

export const commonRoles = [
  'coach',
  'athlete',
  'admin',
  'superadmin',
  'org_admin',
  'school_admin',
  'athletic_director',
  'club_admin',
  'travel_admin',
  'program_director',
  'team_manager',
]
