import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getSessionRole, jsonError } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const missingCoachWaiverTables = (message?: string | null) =>
  /coach_waivers|coach_waiver_assignments|schema cache|relation .* does not exist|table .* does not exist/i.test(String(message || ''))

const loadCoachWaivers = async (userId: string) => {
  const { data: assignments, error: assignmentsError } = await supabaseAdmin
    .from('coach_waiver_assignments')
    .select('id, waiver_id, coach_id, status, sent_at, signed_at, full_name')
    .eq('athlete_id', userId)
    .order('sent_at', { ascending: false })

  if (assignmentsError) {
    if (missingCoachWaiverTables(assignmentsError.message)) return { pending: [], signed: [] }
    throw assignmentsError
  }

  if (!assignments || assignments.length === 0) return { pending: [], signed: [] }

  const waiverIds = Array.from(new Set(assignments.map((assignment) => assignment.waiver_id).filter(Boolean))) as string[]
  const coachIds = Array.from(new Set(assignments.map((assignment) => assignment.coach_id).filter(Boolean))) as string[]

  const [{ data: waivers, error: waiversError }, { data: coaches }] = await Promise.all([
    supabaseAdmin
      .from('coach_waivers')
      .select('id, title, body, created_at, is_active')
      .in('id', waiverIds),
    coachIds.length
      ? supabaseAdmin.from('profiles').select('id, full_name, email').in('id', coachIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name?: string | null; email?: string | null }>, error: null }),
  ])

  if (waiversError) {
    if (missingCoachWaiverTables(waiversError.message)) return { pending: [], signed: [] }
    throw waiversError
  }

  const waiverMap = new Map((waivers || []).map((waiver) => [waiver.id as string, waiver]))
  const coachMap = new Map((coaches || []).map((coach) => [coach.id as string, coach]))

  const rows = assignments
    .map((assignment) => {
      const waiver = waiverMap.get(assignment.waiver_id)
      if (!waiver || waiver.is_active === false) return null
      const coach = coachMap.get(assignment.coach_id)
      const coachName = String(coach?.full_name || coach?.email || '').trim() || 'Your coach'
      return {
        id: `coach:${assignment.id}`,
        source: 'coach' as const,
        assignment_id: assignment.id,
        title: waiver.title,
        body: waiver.body,
        org_name: coachName,
        required_roles: ['athlete'],
        created_at: waiver.created_at || assignment.sent_at,
        signed_at: assignment.signed_at || undefined,
        full_name: assignment.full_name || undefined,
      }
    })
    .filter(Boolean) as Array<{
      id: string
      source: 'coach'
      assignment_id: string
      title: string
      body: string
      org_name: string
      required_roles: string[]
      created_at: string
      signed_at?: string
      full_name?: string
    }>

  return {
    pending: rows.filter((row) => !row.signed_at),
    signed: rows.filter((row) => row.signed_at),
  }
}

// GET /api/waivers/pending — returns active waivers the current user hasn't signed yet
export async function GET() {
  const { session, error } = await getSessionRole()
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const userId = session.user.id
  const coachWaivers = await loadCoachWaivers(userId).catch((error) => {
    throw error
  })

  // Find orgs the user belongs to
  const { data: memberships } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role')
    .eq('user_id', userId)

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ pending: coachWaivers.pending, signed: coachWaivers.signed })
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
    return NextResponse.json({ pending: coachWaivers.pending, signed: coachWaivers.signed })
  }

  // Filter to waivers that require this user's role
  const applicable = waivers.filter((w) =>
    (w.required_roles as string[]).some((r) => userRoles.includes(r))
  )

  if (applicable.length === 0) {
    return NextResponse.json({ pending: coachWaivers.pending, signed: coachWaivers.signed })
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
    .map((w) => ({ ...w, source: 'org' as const, org_name: orgNameMap.get(w.org_id) || 'Your organization' }))

  const signed = applicable
    .filter((w) => signedIds.has(w.id))
    .map((w) => ({
      ...w,
      source: 'org' as const,
      org_name: orgNameMap.get(w.org_id) || 'Your organization',
      signed_at: signedMap.get(w.id)?.signed_at,
      full_name: signedMap.get(w.id)?.full_name,
    }))

  return NextResponse.json({
    pending: [...coachWaivers.pending, ...pending],
    signed: [...coachWaivers.signed, ...signed],
  })
}
