import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { recordWorkspaceAdminAudit } from '@/lib/workspaceAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const VALID_ROLES = new Set(['owner', 'org_admin', 'coach', 'assistant_coach', 'team_manager', 'athlete'])
const RECONCILIATION_TABLES = new Set([
  'sessions', 'coach_waivers', 'org_documents', 'marketplace_items', 'coach_fee_assignments',
  'org_fee_assignments', 'programs', 'stripe_connect_payment_accounting',
  'payment_refund_requests', 'order_disputes',
])

const errorResponse = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadminApi()
  if (auth.error || !auth.user) return auth.error || errorResponse('Unauthorized', 401)
  const { id: workspaceId } = await context.params
  const body = await request.json().catch(() => ({}))
  const action = String(body?.action || '')
  const reason = String(body?.reason || '').trim()
  if (!reason) return errorResponse('A reason is required for every workspace mutation')

  const { data: workspace } = await supabaseAdmin.from('business_workspaces').select('*').eq('id', workspaceId).maybeSingle()
  if (!workspace) return errorResponse('Workspace not found', 404)

  try {
    if (action === 'set_workspace_status') {
      const status = String(body?.status || '')
      if (!['active', 'restricted'].includes(status)) return errorResponse('status must be active or restricted')
      const { data, error } = await supabaseAdmin.from('business_workspaces')
        .update({ status, updated_at: new Date().toISOString() }).eq('id', workspaceId).select().single()
      if (error) throw error
      await recordWorkspaceAdminAudit({ actorId: auth.user.id, actorEmail: auth.user.email, workspaceId,
        eventType: status === 'restricted' ? 'superadmin_workspace_suspended' : 'superadmin_workspace_reactivated',
        recordType: 'business_workspace', recordId: workspaceId, previousState: workspace, newState: data, reason })
      return NextResponse.json({ workspace: data })
    }

    if (action === 'update_membership') {
      const membershipId = String(body?.membership_id || '')
      const { data: existing } = await supabaseAdmin.from('workspace_memberships').select('*')
        .eq('id', membershipId).eq('workspace_id', workspaceId).maybeSingle()
      if (!existing) return errorResponse('Workspace membership not found', 404)
      const roles = Array.isArray(body?.roles) ? body.roles.map(String) : existing.roles
      if (!roles.length || roles.some((role: string) => !VALID_ROLES.has(role))) return errorResponse('Invalid workspace roles')
      const permissions = body?.permissions && typeof body.permissions === 'object' ? body.permissions : existing.permissions
      const status = body?.status ? String(body.status) : existing.status
      if (!['invited', 'active', 'suspended', 'removed'].includes(status)) return errorResponse('Invalid membership status')
      const { data, error } = await supabaseAdmin.from('workspace_memberships')
        .update({ roles, permissions, status, updated_at: new Date().toISOString() })
        .eq('id', membershipId).eq('workspace_id', workspaceId).select().single()
      if (error) throw error
      await recordWorkspaceAdminAudit({ actorId: auth.user.id, actorEmail: auth.user.email, workspaceId,
        eventType: 'superadmin_workspace_membership_updated', recordType: 'workspace_membership', recordId: membershipId,
        previousState: existing, newState: data, reason })
      return NextResponse.json({ membership: data })
    }

    if (action === 'resolve_athlete_request') {
      const requestId = String(body?.request_id || '')
      const status = String(body?.status || '')
      if (!['approved', 'rejected', 'canceled'].includes(status)) return errorResponse('Invalid request resolution status')
      const { data: existing } = await supabaseAdmin.from('athlete_access_requests').select('*')
        .eq('id', requestId).eq('workspace_id', workspaceId).maybeSingle()
      if (!existing) return errorResponse('Athlete access request not found', 404)
      if (existing.status !== 'requested') return errorResponse('Athlete access request is already resolved', 409)
      if (status === 'approved' && existing.athlete_id) {
        const relationshipType = workspace.workspace_type === 'organization' ? 'organization_member' : 'independent_client'
        const { error: relationshipError } = await supabaseAdmin.from('workspace_athlete_relationships').upsert({
          workspace_id: workspaceId, athlete_id: existing.athlete_id, relationship_type: relationshipType,
          status: 'active', approved_by: auth.user.id, updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,athlete_id' })
        if (relationshipError) throw relationshipError
      }
      const { data, error } = await supabaseAdmin.from('athlete_access_requests').update({
        status, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString(),
      }).eq('id', requestId).eq('status', 'requested').select().single()
      if (error) throw error
      await recordWorkspaceAdminAudit({ actorId: auth.user.id, actorEmail: auth.user.email, workspaceId,
        eventType: `superadmin_athlete_access_${status}`, recordType: 'athlete_access_request', recordId: requestId,
        previousState: existing, newState: data, reason })
      return NextResponse.json({ request: data })
    }

    if (action === 'assign_reconciliation_record') {
      const tableName = String(body?.table_name || '')
      const recordId = String(body?.record_id || '')
      if (!RECONCILIATION_TABLES.has(tableName)) return errorResponse('Unsupported reconciliation table')
      const { data: existing, error: loadError } = await supabaseAdmin.from(tableName).select('*').eq('id', recordId).maybeSingle()
      if (loadError) throw loadError
      if (!existing) return errorResponse('Reconciliation record not found', 404)
      if (existing.workspace_id) return errorResponse('Reconciliation record is already assigned', 409)
      const { data, error } = await supabaseAdmin.from(tableName).update({ workspace_id: workspaceId })
        .eq('id', recordId).is('workspace_id', null).select().single()
      if (error) throw error
      await recordWorkspaceAdminAudit({ actorId: auth.user.id, actorEmail: auth.user.email, workspaceId,
        eventType: 'superadmin_reconciliation_assigned', recordType: tableName, recordId,
        previousState: existing, newState: data, reason })
      return NextResponse.json({ record: data })
    }
    return errorResponse('Unsupported workspace action')
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Workspace action failed', 500)
  }
}
