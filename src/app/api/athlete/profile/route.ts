import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin, hasSupabaseAdminConfig } from '@/lib/supabaseAdmin'
import { resolveAthleteProfileBundle } from '@/lib/athleteProfileResolver'

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

  const result = await resolveAthleteProfileBundle({
    supabase: supabaseAdmin,
    athleteId: session.user.id,
    athleteProfileId,
    subProfileId,
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.data, { status: result.status })
}
