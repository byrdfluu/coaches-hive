import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAdminAccess } from '@/lib/adminRoles'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

const requireAdmin = async () => {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: jsonError('Unauthorized', 401) }
  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (!adminAccess.teamRole) return { error: jsonError('Forbidden', 403) }
  const teamRole = adminAccess.teamRole
  return { session, teamRole }
}

// GET /api/admin/waivers
// ?user_id=<uuid>  → signatures for a specific user
// (no params)      → all waivers with org names and sig counts
export async function GET(request: Request) {
  const { error } = await requireAdmin()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')

  // ── User signature lookup ──────────────────────────────────────
  if (userId) {
    const { data: signatures } = await supabaseAdmin
      .from('waiver_signatures')
      .select('id, waiver_id, full_name, signed_at, ip_address')
      .eq('user_id', userId)
      .order('signed_at', { ascending: false })

    if (!signatures || signatures.length === 0) {
      return NextResponse.json({ signatures: [] })
    }

    const waiverIds = signatures.map((s) => s.waiver_id)
    const { data: waivers } = await supabaseAdmin
      .from('org_waivers')
      .select('id, title, org_id')
      .in('id', waiverIds)

    const { data: orgs } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .in('id', (waivers || []).map((w) => w.org_id))

    const waiverMap = new Map((waivers || []).map((w) => [w.id, w]))
    const orgMap = new Map((orgs || []).map((o) => [o.id, o.name as string]))

    const enriched = signatures.map((s) => {
      const waiver = waiverMap.get(s.waiver_id)
      return {
        ...s,
        waiver_title: waiver?.title || 'Unknown waiver',
        org_name: waiver ? (orgMap.get(waiver.org_id) || 'Unknown org') : 'Unknown org',
      }
    })

    return NextResponse.json({ signatures: enriched })
  }

  // ── All waivers view ───────────────────────────────────────────
  const { data: waivers, error: waiverError } = await supabaseAdmin
    .from('org_waivers')
    .select('id, org_id, title, required_roles, is_active, created_at')
    .order('created_at', { ascending: false })

  if (waiverError) return jsonError(waiverError.message, 500)
  if (!waivers || waivers.length === 0) return NextResponse.json({ waivers: [], orgs: [] })

  // Signature counts
  const { data: sigRows } = await supabaseAdmin
    .from('waiver_signatures')
    .select('waiver_id')
    .in('waiver_id', waivers.map((w) => w.id))

  const countMap = new Map<string, number>()
  for (const row of sigRows || []) {
    countMap.set(row.waiver_id, (countMap.get(row.waiver_id) || 0) + 1)
  }

  // Org names
  const orgIds = Array.from(new Set(waivers.map((w) => w.org_id)))
  const { data: orgs } = await supabaseAdmin
    .from('organizations')
    .select('id, name, org_type')
    .in('id', orgIds)

  const orgMap = new Map((orgs || []).map((o) => [o.id, { name: o.name as string, org_type: o.org_type as string }]))

  const result = waivers.map((w) => ({
    ...w,
    signature_count: countMap.get(w.id) || 0,
    org_name: orgMap.get(w.org_id)?.name || 'Unknown org',
    org_type: orgMap.get(w.org_id)?.org_type || null,
  }))

  const orgList = (orgs || []).map((o) => ({ id: o.id, name: o.name }))

  return NextResponse.json({ waivers: result, orgs: orgList })
}
