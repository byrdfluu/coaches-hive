import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAthleteProfileBundle } from '@/lib/athleteProfileResolver'
import { resolveActiveCoachContext } from '@/lib/activeCoachContext'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Use roleCandidates scan so coaches with a temporarily active org/admin role still pass
  const { session, role, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const { id: athleteId } = await params
  const { searchParams } = new URL(request.url)
  const athleteProfileId = searchParams.get('athlete_profile_id')?.trim() || null
  const subProfileId = searchParams.get('sub_profile_id')?.trim() || null

  // Verify the coach has a link to this athlete
  if (role === 'coach') {
    const { data: link } = await supabaseAdmin
      .from('coach_athlete_links')
      .select('id')
      .eq('coach_id', session.user.id)
      .in('athlete_id', Array.from(new Set([athleteId, athleteProfileId].filter(Boolean) as string[])))
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (!link) {
      const context = await resolveActiveCoachContext(session.user.id)
      if (!context.organizationId || !athleteProfileId) {
        return NextResponse.json({ error: 'Athlete not available in the selected workspace' }, { status: 404 })
      }
      let teamIds = context.teamId ? [context.teamId] : []
      if (!teamIds.length) {
        const { data: assignments } = await supabaseAdmin.from('org_team_coaches')
          .select('team_id,org_teams!inner(org_id)')
          .eq('coach_id', session.user.id)
          .eq('org_teams.org_id', context.organizationId)
        teamIds = (assignments || []).map((assignment) => assignment.team_id)
      }
      const { data: teamMember } = teamIds.length
        ? await supabaseAdmin.from('org_team_members').select('athlete_id')
            .eq('athlete_id', athleteProfileId).in('team_id', teamIds).limit(1).maybeSingle()
        : { data: null }
      if (!teamMember) return NextResponse.json({ error: 'Athlete not available in the selected workspace' }, { status: 404 })
    }
  }

  const result = await resolveAthleteProfileBundle({
    supabase: supabaseAdmin,
    athleteId,
    athleteProfileId,
    subProfileId,
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.data, { status: result.status })
}
