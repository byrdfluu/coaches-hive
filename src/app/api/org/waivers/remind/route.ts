import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { insertNotifications } from '@/lib/inAppNotifications'
import { resolveActiveOrganizationStaffContext } from '@/lib/organizationStaffContext'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return jsonError('Unauthorized', 401)

  const context = await resolveActiveOrganizationStaffContext(
    supabase,
    session.user.user_metadata?.current_org_id || null,
    session.user.user_metadata?.active_workspace_id || null,
  )
  if (!context || !['owner','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager'].some(role => context.roles.includes(role))) return jsonError('Forbidden', 403)
  const orgId = context.organizationId

  const body = await request.json().catch(() => ({}))
  const waiverId = typeof body?.waiver_id === 'string' ? body.waiver_id : null
  if (!waiverId) return jsonError('waiver_id is required')

  // Fetch waiver to confirm it belongs to this org
  const { data: waiver } = await supabaseAdmin
    .from('org_waivers')
    .select('id, title, required_roles')
    .eq('id', waiverId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!waiver) return jsonError('Waiver not found', 404)

  // Get org members who match required roles
  const { data: members } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .in('role', waiver.required_roles as string[])

  const memberIds = (members || []).map((m: { user_id: string }) => m.user_id)
  if (memberIds.length === 0) return NextResponse.json({ sent: 0 })

  // Get who has already signed
  const { data: signatures } = await supabaseAdmin
    .from('waiver_signatures')
    .select('user_id')
    .eq('waiver_id', waiverId)
    .in('user_id', memberIds)

  const signedIds = new Set((signatures || []).map((s: { user_id: string }) => s.user_id))
  const unsignedIds = memberIds.filter((id: string) => !signedIds.has(id))

  if (unsignedIds.length === 0) return NextResponse.json({ sent: 0 })

  // Insert notification rows for each unsigned member
  const notifications = unsignedIds.map((userId: string) => ({
    user_id: userId,
    type: 'waiver_reminder',
    title: `Waiver signature needed: ${waiver.title}`,
    body: 'Your organization needs your signature on a waiver. Please sign it at your earliest convenience.',
    action_url: '/athlete/waivers',
  }))

  await insertNotifications(notifications)

  return NextResponse.json({ sent: unsignedIds.length })
}
