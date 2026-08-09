import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'

export const dynamic = 'force-dynamic'
const count = async (table: string, column: string, orgId: string) => {
  const result = await supabaseAdmin.from(table).select('id', { count: 'exact', head: true }).eq(column, orgId)
  return { count: result.count || 0, verified: !result.error }
}
const preview = async (orgId: string) => {
  const { data: workspace } = await supabaseAdmin.from('business_workspaces').select('id').eq('organization_id', orgId).maybeSingle()
  const workspaceId = workspace?.id || '00000000-0000-0000-0000-000000000000'
  const [members, teams, payments, fees, subscriptions, connect, refunds, disputes, documents, waivers] = await Promise.all([
    count('organization_memberships','org_id',orgId), count('org_teams','org_id',orgId), count('org_payments','org_id',orgId), count('org_fee_assignments','org_id',orgId),
    count('platform_subscriptions','organization_id',orgId), count('stripe_connect_accounts','org_id',orgId), count('payment_refund_requests','workspace_id',workspaceId), count('order_disputes','workspace_id',workspaceId), count('org_documents','org_id',orgId), count('coach_waiver_assignments','workspace_id',workspaceId),
  ])
  const dependencies = { members: members.count, teams: teams.count, payments: payments.count, fees: fees.count, subscriptions: subscriptions.count, connect_accounts: connect.count, refunds: refunds.count, disputes: disputes.count, documents: documents.count, waiver_proofs: waivers.count }
  const historyKeys = ['payments','fees','subscriptions','connect_accounts','refunds','disputes','documents','waiver_proofs'] as const
  const verified = [members,teams,payments,fees,subscriptions,connect,refunds,disputes,documents,waivers].every(x => x.verified)
  return { dependencies, verified, can_delete: verified && members.count === 0 && teams.count === 0 && historyKeys.every(k => dependencies[k] === 0) }
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadminApi(); if (auth.error) return auth.error
  const { id } = await context.params
  const { data: org } = await supabaseAdmin.from('organizations').select('id,name,status').eq('id', id).maybeSingle()
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  return NextResponse.json({ org, preview: await preview(id) })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperadminApi(); if (auth.error || !auth.user) return auth.error
  const { id } = await context.params, body = await request.json().catch(() => ({})), action = String(body.action || ''), reason = String(body.reason || '').trim()
  if (reason.length < 5) return NextResponse.json({ error: 'A reason of at least 5 characters is required.' }, { status: 400 })
  const { data: before } = await supabaseAdmin.from('organizations').select('*').eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  if (action === 'suspend' || action === 'reactivate') {
    const status = action === 'suspend' ? 'suspended' : 'active'
    const { data: after, error } = await supabaseAdmin.from('organizations').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await supabaseAdmin.from('business_workspaces').update({ status: action === 'suspend' ? 'restricted' : 'active', updated_at: new Date().toISOString() }).eq('organization_id', id)
    await logAdminAction({ action: `admin.organization.${action}d`, actorId: auth.user.id, actorEmail: auth.user.email, targetType: 'organization', targetId: id, metadata: { workspace_id: null, previous_state: before, new_state: after, reason } })
    return NextResponse.json({ org: after })
  }
  const supabase = await createRouteHandlerClientCompat()
  if (action === 'archive') {
    const { error } = await supabase.rpc('admin_archive_organization', { p_org_id: id, p_reason: reason })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  if (action === 'delete') {
    const dependencyPreview = await preview(id)
    if (!dependencyPreview.can_delete) return NextResponse.json({ error: 'Permanent deletion is blocked because the organization is not an empty test organization or its dependency check could not be verified.', preview: dependencyPreview }, { status: 409 })
    if (String(body.confirmation || '') !== before.name) return NextResponse.json({ error: 'Type the exact organization name to confirm deletion.' }, { status: 400 })
    const { error } = await supabase.rpc('admin_delete_empty_test_organization', { p_org_id: id, p_confirmation: body.confirmation, p_reason: reason })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
}
