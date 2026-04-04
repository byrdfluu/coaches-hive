import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionRole, jsonError } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// GET /api/waivers/pending — returns active waivers the current user hasn't signed yet
export async function GET() {
  const { session, error } = await getSessionRole()
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const userId = session.user.id

  // Find orgs the user belongs to
  const { data: memberships } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role')
    .eq('user_id', userId)

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ pending: [], signed: [] })
  }

  const orgIds = memberships.map((m) => m.org_id)
  const userRoles = memberships.map((m) => m.role as string)

  // Get active waivers for those orgs that apply to the user's role(s)
  const { data: waivers } = await supabaseAdmin
    .from('org_waivers')
    .select('id, org_id, title, body, required_roles, created_at')
    .in('org_id', orgIds)
    .eq('is_active', true)

  if (!waivers || waivers.length === 0) {
    return NextResponse.json({ pending: [], signed: [] })
  }

  // Filter to waivers that require this user's role
  const applicable = waivers.filter((w) =>
    (w.required_roles as string[]).some((r) => userRoles.includes(r))
  )

  if (applicable.length === 0) {
    return NextResponse.json({ pending: [], signed: [] })
  }

  // Get existing signatures for this user
  const applicableIds = applicable.map((w) => w.id)
  const { data: signatures } = await supabaseAdmin
    .from('waiver_signatures')
    .select('waiver_id, signed_at, full_name')
    .eq('user_id', userId)
    .in('waiver_id', applicableIds)

  const signedIds = new Set((signatures || []).map((s) => s.waiver_id))
  const signedMap = new Map((signatures || []).map((s) => [s.waiver_id, s]))

  // Load org names for display
  const { data: orgs } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .in('id', orgIds)

  const orgNameMap = new Map((orgs || []).map((o) => [o.id, o.name as string]))

  const pending = applicable
    .filter((w) => !signedIds.has(w.id))
    .map((w) => ({ ...w, org_name: orgNameMap.get(w.org_id) || 'Your organization' }))

  const signed = applicable
    .filter((w) => signedIds.has(w.id))
    .map((w) => ({
      ...w,
      org_name: orgNameMap.get(w.org_id) || 'Your organization',
      signed_at: signedMap.get(w.id)?.signed_at,
      full_name: signedMap.get(w.id)?.full_name,
    }))

  return NextResponse.json({ pending, signed })
}
