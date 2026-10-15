import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { supabase, session, error } = await getSessionRole(['athlete'])
  if (error || !session) return error
  const athlete = await resolveAuthorizedAthleteContext(session.user.id, new URL(request.url).searchParams.get('athlete_profile_id'))
  if (!athlete) return jsonError('Athlete access denied.', 403)

  const { data: offeringCalendar, error: calendarError } = await (supabase as any).rpc('family_offering_calendar', {
    p_athlete_id: athlete.profileId,
  })
  if (calendarError) return jsonError(`Unable to load offering calendar: ${calendarError.message}`, 500)

  const db = supabaseAdmin as any
  const {data:trainingBookings}=await db.from('org_training_session_bookings').select('id,session_id,status,booking_type,booked_at,cancelled_at').eq('athlete_id',athlete.profileId).in('status',['pending_payment','reserved','attended','cancelled','late_cancel','no_show'])
  const trainingIds=(trainingBookings||[]).map((row:any)=>row.session_id)
  const {data:trainingSessions}=trainingIds.length?await db.from('org_training_sessions').select('id,title,starts_at,ends_at,timezone,location,status,capacity').in('id',trainingIds):{data:[]}
  const familyRows=(offeringCalendar||[]).map((row:any)=>({
    ...row,
    id:row.occurrence_id,
    occurrence_id:row.occurrence_id,
    offering:{name:row.title,type:row.offering_type},
  }))
  const trainingRows=(trainingBookings||[]).map((booking:any)=>{const session=(trainingSessions||[]).find((row:any)=>row.id===booking.session_id);return session?{...session,occurrence_id:session.id,calendar_revision:1,booking,offering:{name:session.title||'Training session',type:'training_session'},offering_type:'training_session',payment_label:booking.booking_type==='credit'?'Credit used':'Training registration'}:null}).filter(Boolean)
  return NextResponse.json({ occurrences:[...familyRows,...trainingRows].sort((a:any,b:any)=>new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime()) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
