import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' }

async function context(request: Request, requestedProfileId?: string | null) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return { error, athlete: null }
  const url = new URL(request.url)
  const profileId = requestedProfileId || url.searchParams.get('athlete_profile_id') || null
  const athlete = await resolveAuthorizedAthleteContext(session.user.id, profileId)
  return athlete ? { error: null, athlete } : { error: jsonError('Athlete profile not found.', 404), athlete: null }
}

export async function GET(request: Request) {
  const { error, athlete } = await context(request)
  if (error || !athlete) return error
  const ids = (new URL(request.url).searchParams.get('event_ids') || '').split(',').map((id) => id.trim()).filter(Boolean).slice(0, 100)
  let query = supabaseAdmin.from('athlete_schedule_rsvps').select('id,event_source,event_id,athlete_id,status,created_at,updated_at').eq('athlete_id', athlete.profileId).eq('event_source', 'practice_plan')
  if (ids.length) query = query.in('event_id', ids)
  const { data, error: dbError } = await query
  if (dbError) return jsonError('Unable to load schedule responses.', 500)
  return NextResponse.json({ responses: data || [] }, { headers: noStore })
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null)
  const eventId = String(body?.event_id || '').trim()
  const status = String(body?.status || '').trim().toLowerCase()
  if (!eventId || !['confirmed', 'declined'].includes(status)) return jsonError('A valid event and response are required.')
  const { error, athlete } = await context(request, String(body?.athlete_profile_id || '').trim() || null)
  if (error || !athlete) return error
  const [{ data: plan }, { data: invitation }] = await Promise.all([
    supabaseAdmin.from('practice_plans').select('id,team_id').eq('id', eventId).maybeSingle(),
    supabaseAdmin.from('practice_plan_invitations').select('id').eq('practice_plan_id', eventId).eq('athlete_id', athlete.profileId).neq('status', 'removed').maybeSingle(),
  ])
  const { data: teamMember } = plan?.team_id
    ? await supabaseAdmin.from('org_team_members').select('team_id').eq('team_id', plan.team_id).eq('athlete_id', athlete.profileId).maybeSingle()
    : { data: null }
  if (!plan || (!invitation && !teamMember)) return jsonError('This event is not available to the selected athlete.', 403)
  const { data, error: dbError } = await supabaseAdmin.from('athlete_schedule_rsvps').upsert({
    event_source: 'practice_plan', event_id: eventId, athlete_id: athlete.profileId, status, updated_at: new Date().toISOString(),
  }, { onConflict: 'event_source,event_id,athlete_id' }).select('*').single()
  if (dbError) return jsonError('Unable to save the schedule response.', 500)
  return NextResponse.json({ response: data }, { headers: noStore })
}
