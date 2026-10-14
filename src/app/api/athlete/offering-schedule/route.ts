import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error
  const athlete = await resolveAuthorizedAthleteContext(session.user.id, new URL(request.url).searchParams.get('athlete_profile_id'))
  if (!athlete) return jsonError('Athlete access denied.', 403)
  const db = supabaseAdmin as any
  const { data: selections } = await db.from('org_offering_registration_occurrences').select('*')
    .eq('athlete_id', athlete.profileId).in('status', ['reserved','attended','cancelled','late_cancel','no_show'])
  const programRegistrationIds = (selections || []).filter((row:any)=>row.registration_type==='program').map((row:any)=>row.registration_id)
  const { data: registrations } = programRegistrationIds.length ? await db.from('program_registrations')
    .select('id,program_id,status,receipt_url').in('id', programRegistrationIds) : { data: [] }
  const occurrenceIds = (selections || []).map((row:any)=>row.occurrence_id)
  const programIds = (registrations || []).map((row:any)=>row.program_id)
  const [{ data: occurrences }, { data: programs }] = await Promise.all([
    occurrenceIds.length ? db.from('org_offering_occurrences').select('id,offering_id,starts_at,ends_at,timezone,location,field_or_court,status,capacity').in('id', occurrenceIds) : Promise.resolve({data:[]}),
    programIds.length ? db.from('programs').select('id,name,type').in('id', programIds) : Promise.resolve({data:[]}),
  ])
  return NextResponse.json({ occurrences: (selections || []).map((selection:any)=>{
    const occurrence=(occurrences||[]).find((row:any)=>row.id===selection.occurrence_id)
    const registration=(registrations||[]).find((row:any)=>row.id===selection.registration_id)
    return occurrence ? {...occurrence,booking:selection,registration,offering:(programs||[]).find((row:any)=>row.id===occurrence.offering_id)} : null
  }).filter(Boolean) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
