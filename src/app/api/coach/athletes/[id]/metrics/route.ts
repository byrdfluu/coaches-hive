import { NextRequest, NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const COACH_ROLES = ['coach', 'assistant_coach', 'admin', 'superadmin']

async function resolveAthleteProfile(athleteId: string, requestedProfileId: string | null) {
  let query = supabaseAdmin
    .from('athlete_profiles')
    .select('id, owner_user_id, is_primary')
    .eq('owner_user_id', athleteId)

  query = requestedProfileId
    ? query.eq('id', requestedProfileId)
    : query.eq('is_primary', true)

  const { data } = await query.order('display_order', { ascending: true }).limit(1).maybeSingle()
  return data || null
}

async function verifyCoachAccess(coachId: string, athleteId: string, athleteProfileId: string | null) {
  const candidateIds = [athleteId, athleteProfileId].filter((value): value is string => Boolean(value))
  const { data } = await supabaseAdmin
    .from('coach_athlete_links')
    .select('id')
    .eq('coach_id', coachId)
    .in('athlete_id', candidateIds)
    .limit(1)
    .maybeSingle()
  if (data) return true

  if (!athleteProfileId) return false
  const { data: memberships } = await supabaseAdmin
    .from('org_team_members')
    .select('team_id')
    .eq('athlete_id', athleteProfileId)
  const teamIds = (memberships || []).map((row) => row.team_id)
  const { data: teamCoach } = teamIds.length > 0
    ? await supabaseAdmin
      .from('org_team_coaches')
      .select('id')
      .eq('coach_id', coachId)
      .in('team_id', teamIds)
      .limit(1)
      .maybeSingle()
    : { data: null }
  if (teamCoach) return true

  const [{ data: coachMemberships }, { data: athleteMemberships }] = await Promise.all([
    supabaseAdmin.from('organization_memberships').select('org_id').eq('user_id', coachId).in('role', ['coach', 'assistant_coach']),
    supabaseAdmin.from('organization_memberships').select('org_id').eq('user_id', athleteId),
  ])
  const coachOrgIds = new Set((coachMemberships || []).map((row) => row.org_id))
  return (athleteMemberships || []).some((row) => coachOrgIds.has(row.org_id))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(COACH_ROLES)
  if (error || !session) return error

  const { id: athleteId } = await params
  const coachId = session.user.id
  const isAdmin = ['admin', 'superadmin'].includes(session.user.user_metadata?.role)
  const requestedProfileId = req.nextUrl.searchParams.get('athlete_profile_id')?.trim() || null
  const athleteProfile = await resolveAthleteProfile(athleteId, requestedProfileId)
  if (requestedProfileId && !athleteProfile) return jsonError('Athlete profile not found', 404)

  if (!isAdmin) {
    const hasAccess = await verifyCoachAccess(coachId, athleteId, athleteProfile?.id || requestedProfileId)
    if (!hasAccess) return jsonError('No access to this athlete', 403)
  }

  const metricLabel = req.nextUrl.searchParams.get('metric_label')

  let query = supabaseAdmin
    .from('athlete_metric_snapshots')
    .select('id, metric_label, value, unit, recorded_at, source, notes, created_at')
    .eq('athlete_id', athleteId)
    .order('recorded_at', { ascending: true })

  if (athleteProfile?.id) query = query.eq('athlete_profile_id', athleteProfile.id)

  if (metricLabel) {
    query = query.eq('metric_label', metricLabel)
  }

  const { data, error: dbError } = await query
  if (dbError) return jsonError(dbError.message, 500)

  // Group by metric_label
  const grouped: Record<string, typeof data> = {}
  for (const row of data || []) {
    if (!grouped[row.metric_label]) grouped[row.metric_label] = []
    grouped[row.metric_label]!.push(row)
  }

  return NextResponse.json({ snapshots: data || [], grouped })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await getSessionRole(COACH_ROLES)
  if (error || !session) return error

  const { id: athleteId } = await params
  const coachId = session.user.id
  const isAdmin = ['admin', 'superadmin'].includes(session.user.user_metadata?.role)

  const body = await req.json().catch(() => ({}))
  const { metric_label, value, unit, recorded_at, notes } = body
  const requestedProfileId = typeof body?.athlete_profile_id === 'string' && body.athlete_profile_id.trim()
    ? body.athlete_profile_id.trim()
    : req.nextUrl.searchParams.get('athlete_profile_id')?.trim() || null
  const athleteProfile = await resolveAthleteProfile(athleteId, requestedProfileId)
  if (requestedProfileId && !athleteProfile) return jsonError('Athlete profile not found', 404)

  if (!isAdmin) {
    const hasAccess = await verifyCoachAccess(coachId, athleteId, athleteProfile?.id || requestedProfileId)
    if (!hasAccess) return jsonError('No access to this athlete', 403)
  }

  if (!metric_label?.trim() || !value?.toString().trim()) {
    return jsonError('metric_label and value are required', 400)
  }

  const { data: snapshot, error: insertError } = await supabaseAdmin
    .from('athlete_metric_snapshots')
    .insert({
      athlete_id: athleteId,
      athlete_profile_id: athleteProfile?.id || null,
      coach_id: coachId,
      metric_label: metric_label.trim(),
      value: value.toString().trim(),
      unit: unit?.trim() || null,
      recorded_at: recorded_at || new Date().toISOString().split('T')[0],
      source: 'manual',
      notes: notes?.trim() || null,
    })
    .select()
    .single()

  if (insertError) return jsonError(insertError.message, 500)

  // Keep athlete_metrics (current-value table) in sync with latest value
  let currentQuery = supabaseAdmin
    .from('athlete_metrics')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('label', metric_label.trim())
  currentQuery = athleteProfile?.id
    ? currentQuery.eq('athlete_profile_id', athleteProfile.id)
    : currentQuery.is('athlete_profile_id', null)
  const { data: current } = await currentQuery.limit(1).maybeSingle()
  const currentValue = {
      athlete_id: athleteId,
      athlete_profile_id: athleteProfile?.id || null,
      label: metric_label.trim(),
      value: value.toString().trim(),
      unit: unit?.trim() || null,
  }
  const { error: currentError } = current
    ? await supabaseAdmin.from('athlete_metrics').update(currentValue).eq('id', current.id)
    : await supabaseAdmin.from('athlete_metrics').insert(currentValue)
  if (currentError) return jsonError(currentError.message, 500)

  return NextResponse.json({ snapshot })
}
