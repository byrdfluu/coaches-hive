import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionRole, jsonError } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// GET /api/waivers/athlete-status
// Returns { [athlete_id]: { signed: number, total: number } }
// for every athlete linked to the current coach, across all shared orgs
export async function GET() {
  const { session, error } = await getSessionRole(['coach', 'assistant_coach', 'admin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const coachId = session.user.id

  // Find athlete IDs linked to this coach
  const { data: links } = await supabaseAdmin
    .from('coach_athlete_links')
    .select('athlete_id')
    .eq('coach_id', coachId)
    .eq('status', 'active')

  if (!links || links.length === 0) {
    return NextResponse.json({ status: {} })
  }

  const athleteIds = links.map((l) => l.athlete_id as string)

  // Find orgs both coach and each athlete share
  const { data: coachMemberships } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', coachId)

  const coachOrgIds = (coachMemberships || []).map((m) => m.org_id as string)

  if (coachOrgIds.length === 0) {
    return NextResponse.json({ status: Object.fromEntries(athleteIds.map((id) => [id, { signed: 0, total: 0 }])) })
  }

  // Athlete memberships in the same orgs
  const { data: athleteMemberships } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id, org_id, role')
    .in('user_id', athleteIds)
    .in('org_id', coachOrgIds)

  if (!athleteMemberships || athleteMemberships.length === 0) {
    return NextResponse.json({ status: Object.fromEntries(athleteIds.map((id) => [id, { signed: 0, total: 0 }])) })
  }

  // Active waivers for those orgs
  const sharedOrgIds = Array.from(new Set(athleteMemberships.map((m) => m.org_id as string)))
  const { data: waivers } = await supabaseAdmin
    .from('org_waivers')
    .select('id, org_id, required_roles')
    .in('org_id', sharedOrgIds)
    .eq('is_active', true)

  if (!waivers || waivers.length === 0) {
    return NextResponse.json({ status: Object.fromEntries(athleteIds.map((id) => [id, { signed: 0, total: 0 }])) })
  }

  // Signatures for all these athletes on these waivers
  const waiverIds = waivers.map((w) => w.id)
  const { data: signatures } = await supabaseAdmin
    .from('waiver_signatures')
    .select('waiver_id, user_id')
    .in('waiver_id', waiverIds)
    .in('user_id', athleteIds)

  const signedSet = new Set((signatures || []).map((s) => `${s.user_id}:${s.waiver_id}`))

  // Build per-athlete counts
  const statusMap: Record<string, { signed: number; total: number }> = {}

  for (const athleteId of athleteIds) {
    const membership = athleteMemberships.find((m) => m.user_id === athleteId)
    if (!membership) {
      statusMap[athleteId] = { signed: 0, total: 0 }
      continue
    }

    const athleteRole = membership.role as string
    const athleteOrgId = membership.org_id as string

    const applicableWaivers = waivers.filter(
      (w) => w.org_id === athleteOrgId && (w.required_roles as string[]).includes(athleteRole)
    )

    const total = applicableWaivers.length
    const signed = applicableWaivers.filter((w) => signedSet.has(`${athleteId}:${w.id}`)).length

    statusMap[athleteId] = { signed, total }
  }

  return NextResponse.json({ status: statusMap })
}
