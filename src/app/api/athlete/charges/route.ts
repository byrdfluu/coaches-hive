import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const requestedProfileId = new URL(request.url).searchParams.get('athlete_profile_id')
    || String(session.user.user_metadata?.selected_athlete_profile_id || '')
  const athleteContext = await resolveAuthorizedAthleteContext(session.user.id, requestedProfileId)
  if (!athleteContext) return NextResponse.json({ error: 'Athlete profile not found' }, { status: 404 })

  const { data: assignments } = await supabaseAdmin
    .from('org_fee_assignments')
    .select('id, fee_id, status, paid_at, created_at')
    .eq('athlete_id', athleteContext.profileId)
    .order('created_at', { ascending: false })
    .limit(100)

  const feeIds = (assignments || []).map((row) => row.fee_id)
  const { data: fees } = feeIds.length
    ? await supabaseAdmin
        .from('org_fees')
        .select('id, org_id, title, amount_cents, due_date, audience_type, team_id, created_by, created_at')
        .in('id', feeIds)
    : { data: [] }

  return NextResponse.json({ assignments: assignments || [], fees: fees || [], athlete_profile_id: athleteContext.profileId }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
