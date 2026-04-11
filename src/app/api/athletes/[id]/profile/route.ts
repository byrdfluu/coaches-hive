import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAthleteProfileBundle } from '@/lib/athleteProfileResolver'

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
  const subProfileId = searchParams.get('sub_profile_id')?.trim() || null

  // Verify the coach has a link to this athlete
  if (role === 'coach') {
    const { data: link } = await supabaseAdmin
      .from('coach_athlete_links')
      .select('id')
      .eq('coach_id', session.user.id)
      .eq('athlete_id', athleteId)
      .maybeSingle()

    if (!link) {
      return NextResponse.json({ error: 'Athlete not linked to your account' }, { status: 404 })
    }
  }

  const result = await resolveAthleteProfileBundle({
    supabase: supabaseAdmin,
    athleteId,
    subProfileId,
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.data, { status: result.status })
}
