import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin, hasSupabaseAdminConfig } from '@/lib/supabaseAdmin'
import { resolveAthleteProfileBundle } from '@/lib/athleteProfileResolver'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  if (!hasSupabaseAdminConfig) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const athleteProfileId = searchParams.get('athlete_profile_id')?.trim() || null
  const subProfileId = searchParams.get('sub_profile_id')?.trim() || null
  const requestedProfileId = athleteProfileId || subProfileId
    || String(session.user.user_metadata?.selected_athlete_profile_id || '').trim()
    || null
  const athleteContext = await resolveAuthorizedAthleteContext(session.user.id, requestedProfileId)
  if (!athleteContext) return NextResponse.json({ error: 'Athlete profile not found' }, { status: 404 })

  const result = await resolveAthleteProfileBundle({
    supabase: supabaseAdmin,
    athleteId: athleteContext.ownerUserId,
    athleteProfileId: athleteContext.profileId,
    subProfileId: athleteContext.legacySubProfileId,
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.data, { status: result.status })
}
