import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { resolveAthleteProfileBundle } from '@/lib/athleteProfileResolver'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { session, supabase, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const { searchParams } = new URL(request.url)
  const subProfileId = searchParams.get('sub_profile_id')?.trim() || null

  const result = await resolveAthleteProfileBundle({
    supabase,
    athleteId: session.user.id,
    subProfileId,
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.data, { status: result.status })
}
