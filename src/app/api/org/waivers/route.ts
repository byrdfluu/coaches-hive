import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

const requireOrgAdmin = async () => {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: jsonError('Unauthorized', 401) }

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role')
    .eq('user_id', session.user.id)
    .in('role', ['admin', 'owner'])
    .maybeSingle()

  if (!membership) return { error: jsonError('Forbidden', 403) }
  return { session, orgId: membership.org_id }
}

// GET /api/org/waivers
// ?waiver_id=<id> → signed + unsigned member lists for that waiver
// (no params)     → list all waivers with signature counts
export async function GET(request: Request) {
  const { error, orgId } = await requireOrgAdmin()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const waiverId = searchParams.get('waiver_id')

  // Per-waiver drilldown
  if (waiverId) {
    const { data: waiver } = await supabaseAdmin
      .from('org_waivers')
      .select('id, title, required_roles, is_active')
      .eq('id', waiverId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!waiver) return jsonError('Waiver not found', 404)

    const { data: members } = await supabaseAdmin
      .from('organization_memberships')
      .select('user_id, role')
      .eq('org_id', orgId)
      .in('role', waiver.required_roles as string[])

    if (!members || members.length === 0) {
      return NextResponse.json({ signed: [], unsigned: [], waiver })
    }

    const memberIds = members.map((m) => m.user_id)

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', memberIds)

    const profileMap = new Map((profiles || []).map((p) => [p.id as string, p]))

    const { data: signatures } = await supabaseAdmin
      .from('waiver_signatures')
      .select('user_id, full_name, signed_at')
      .eq('waiver_id', waiverId)
      .in('user_id', memberIds)

    const sigMap = new Map((signatures || []).map((s) => [s.user_id as string, s]))
    const signedIds = new Set(Array.from(sigMap.keys()))

    const signed = Array.from(signedIds).map((uid) => {
      const p = profileMap.get(uid)
      const s = sigMap.get(uid)
      return {
        user_id: uid,
        full_name: p?.full_name || s?.full_name || 'Unknown',
        email: p?.email || null,
        signed_at: s?.signed_at,
      }
    })

    const unsigned = memberIds
      .filter((id) => !signedIds.has(id))
      .map((uid) => {
        const p = profileMap.get(uid)
        return { user_id: uid, full_name: p?.full_name || 'Unknown', email: p?.email || null }
      })

    return NextResponse.json({ signed, unsigned, waiver })
  }

  // All waivers list
  const { data: waivers, error: queryError } = await supabaseAdmin
    .from('org_waivers')
    .select('id, title, body, required_roles, is_active, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (queryError) return jsonError(queryError.message, 500)

  const waiverIds = (waivers || []).map((w) => w.id)
  const { data: sigCounts } = waiverIds.length
    ? await supabaseAdmin
        .from('waiver_signatures')
        .select('waiver_id')
        .in('waiver_id', waiverIds)
    : { data: [] }

  const countMap = new Map<string, number>()
  for (const row of sigCounts || []) {
    countMap.set(row.waiver_id, (countMap.get(row.waiver_id) || 0) + 1)
  }

  const result = (waivers || []).map((w) => ({
    ...w,
    signature_count: countMap.get(w.id) || 0,
  }))

  return NextResponse.json({ waivers: result })
}

// POST /api/org/waivers — create a new waiver
export async function POST(request: Request) {
  const { error, orgId, session } = await requireOrgAdmin()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const title = String(body?.title || '').trim()
  const waiverBody = String(body?.body || '').trim()
  const requiredRoles = Array.isArray(body?.required_roles) ? body.required_roles : ['athlete']

  if (!title) return jsonError('title is required')
  if (!waiverBody) return jsonError('body is required')

  const VALID_WAIVER_ROLES = ['athlete', 'coach', 'assistant_coach', 'org_admin', 'club_admin', 'travel_admin', 'school_admin', 'guardian', 'team_manager']
  const invalidRole = requiredRoles.find((r: unknown) => typeof r !== 'string' || !VALID_WAIVER_ROLES.includes(r))
  if (invalidRole !== undefined) {
    return jsonError(`Invalid role in required_roles: "${invalidRole}"`, 400)
  }

  const { data: waiver, error: insertError } = await supabaseAdmin
    .from('org_waivers')
    .insert({
      org_id: orgId,
      title,
      body: waiverBody,
      required_roles: requiredRoles,
      is_active: true,
      created_by: session!.user.id,
    })
    .select('id, title, body, required_roles, is_active, created_at')
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  return NextResponse.json({ waiver })
}

// PATCH /api/org/waivers — toggle active status
export async function PATCH(request: Request) {
  const { error, orgId } = await requireOrgAdmin()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const id = String(body?.id || '').trim()
  const isActive = typeof body?.is_active === 'boolean' ? body.is_active : null

  if (!id) return jsonError('id is required')
  if (isActive === null) return jsonError('is_active is required')

  const { error: updateError } = await supabaseAdmin
    .from('org_waivers')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)

  if (updateError) return jsonError(updateError.message, 500)

  return NextResponse.json({ success: true })
}
