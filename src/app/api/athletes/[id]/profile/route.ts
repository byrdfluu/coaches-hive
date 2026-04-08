import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Use roleCandidates scan so coaches with a temporarily active org/admin role still pass
  const { session, role, error } = await getSessionRole(['coach', 'admin'])
  if (error || !session) return error

  const { id: athleteId } = await params

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

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(
      'id, full_name, email, avatar_url, bio, athlete_sport, athlete_location, athlete_season, athlete_grade_level, athlete_birthdate, guardian_name, guardian_email, guardian_phone'
    )
    .eq('id', athleteId)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Athlete not found' }, { status: 404 })
  }

  return NextResponse.json({ profile })
}
