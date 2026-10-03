import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import type { User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { activeWorkspaceRole, authorizeWorkspaceRequest, logWorkspaceAuthority, workspaceCan, type WorkspaceContext } from '@/lib/workspaceAuthority'
import { userOwnsAthleteProfile } from '@/lib/athleteProfileOwnership'
import { isStripeConnectEnabled, loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'
import { correlatedError, requestIdFor } from '@/lib/requestSecurity'
import type { MobileFieldErrors } from '@/lib/mobileApiContract'

const errorCode = (status: number) => status === 401 ? 'unauthorized' : status === 403 ? 'forbidden'
  : status === 404 ? 'not_found' : status === 409 ? 'conflict' : status === 429 ? 'rate_limited'
    : status === 503 ? 'not_ready' : status >= 500 ? 'internal_error' : 'invalid_request'
export const mobileError = (error: string, status = 400, retryable = status === 429 || status >= 500, requestId: string = randomUUID(), fieldErrors?: MobileFieldErrors) => {
  const code = errorCode(status)
  return correlatedError(requestId, code, error, status, retryable, fieldErrors)
}

export async function requireMobileUser(request: Request): Promise<{ user: User } | { response: NextResponse }> {
  const user = await getMobileRequestUser(request)
  return user ? { user } : { response: mobileError('Unauthorized', 401) }
}

export async function requireMobileOrgAuthority(request: Request, permission = 'manage_payments'):
Promise<{ user: User; workspace: WorkspaceContext; orgId: string } | { response: NextResponse }> {
  const requestId=requestIdFor(request)
  const auth = await requireMobileUser(request)
  if ('response' in auth) return auth
  const authority = await authorizeWorkspaceRequest({ request, userId: auth.user.id, expectedType: 'organization' })
  logWorkspaceAuthority({ requestId, userId: auth.user.id, request, route: 'mobile payment API', result: authority })
  if (!authority.ok) return { response: correlatedError(requestId, authority.code, 'Organization workspace access is required.', authority.status, false) }
  const workspace = authority.workspace
  if (!workspace.organizationId) return { response: correlatedError(requestId,'workspace_forbidden','Organization workspace access is required.',403,false) }
  const actingRole=activeWorkspaceRole(workspace,request.headers.get('x-acting-role'))
  if(!actingRole)return {response:correlatedError(requestId,'invalid_acting_role','Select an active role for this workspace and try again.',403,false)}
  if (!workspaceCan({...workspace,roles:[actingRole]}, permission)) return { response: correlatedError(requestId,'missing_permission','You do not have permission to manage organization payments.',403,false) }
  return { user: auth.user, workspace, orgId: workspace.organizationId }
}

export async function requireMobileOrgStripeReady(orgId: string) {
  const status = await loadStripeConnectAccountStatus('org', orgId, { refresh: true })
  return isStripeConnectEnabled(status)
    ? null
    : mobileError('Finish Stripe Connect onboarding before publishing or collecting payment.', 409, false)
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
