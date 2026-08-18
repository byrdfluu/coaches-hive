import { createHash } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireWorkspaceContext, workspaceCan, type WorkspaceContext } from '@/lib/workspaceAuthority'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'

export const mobileError = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function requireMobileUser(request: Request): Promise<{ user: User } | { response: NextResponse }> {
  const user = await getMobileRequestUser(request)
  return user ? { user } : { response: mobileError('Unauthorized', 401) }
}

export async function requireMobileOrgAuthority(request: Request, permission = 'manage_payments'):
Promise<{ user: User; workspace: WorkspaceContext; orgId: string } | { response: NextResponse }> {
  const auth = await requireMobileUser(request)
  if ('response' in auth) return auth
  const workspaceId = request.headers.get('x-workspace-id') || new URL(request.url).searchParams.get('workspace_id') || undefined
  const workspace = await requireWorkspaceContext(auth.user.id, workspaceId)
  if (!workspace || workspace.type !== 'organization' || !workspace.organizationId) return { response: mobileError('Organization workspace access is required', 403) }
  if (!workspaceCan(workspace, permission)) return { response: mobileError('You do not have permission to manage organization payments', 403) }
  return { user: auth.user, workspace, orgId: workspace.organizationId }
}

export const requireIdempotencyKey = (body: Record<string, unknown>) => {
  const value = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : ''
  return value.length >= 8 && value.length <= 200 ? value : null
}

export const stripeIdempotencyKey = (scope: string, userId: string, supplied: string) =>
  `mobile:${scope}:${createHash('sha256').update(`${userId}:${supplied}`).digest('hex')}`

export async function userCanAccessPlayer(userId: string, playerId: string) {
  return userOwnsAthleteProfile(supabaseAdmin, userId, playerId)
}

export async function teamBelongsToOrg(teamId: string | null | undefined, orgId: string) {
  if (!teamId) return true
  const { data } = await supabaseAdmin.from('org_teams').select('id').eq('id', teamId).eq('org_id', orgId).maybeSingle()
  return Boolean(data)
}

export const money = (value: unknown) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount) : 0
}
