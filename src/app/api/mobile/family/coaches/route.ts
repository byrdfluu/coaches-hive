import {NextResponse} from 'next/server'
import {getMobileRequestUser} from '@/lib/mobileRequestAuth'
import {resolveAuthorizedAthleteContext} from '@/lib/authorizedAthleteContext'
import {mobileContractError} from '@/lib/mobileApiContract'
import {supabaseAdmin} from '@/lib/supabaseAdmin'
import {parseUuid} from '@/lib/uuid'

export const dynamic='force-dynamic'
const fail=(code:string,message:string,status:number)=>mobileContractError(code,message,status,status>=500)

export async function GET(request:Request){
  const user=await getMobileRequestUser(request);if(!user)return fail('unauthorized','Authentication is required.',401)
  const athleteId=parseUuid(new URL(request.url).searchParams.get('athlete_profile_id'))
  if(!athleteId||!await resolveAuthorizedAthleteContext(user.id,athleteId))return fail('ATHLETE_PROFILE_UNAVAILABLE','Athlete profile is unavailable.',404)
  const {data,error}=await supabaseAdmin.rpc('discover_public_coaches')
  if(error)return fail('coach_discovery_unavailable','Coach discovery is temporarily unavailable.',503)
  return NextResponse.json({athlete_profile_id:athleteId,coaches:data||[]},{headers:{'Cache-Control':'private, no-store'}})
}

export async function POST(request:Request){
  const user=await getMobileRequestUser(request);if(!user)return fail('unauthorized','Authentication is required.',401)
  const body=await request.json().catch(()=>({})),athleteId=parseUuid(body?.athlete_profile_id),coachId=parseUuid(body?.coach_id)
  if(!athleteId||!coachId||!await resolveAuthorizedAthleteContext(user.id,athleteId))return fail('ATHLETE_PROFILE_UNAVAILABLE','Athlete profile is unavailable.',404)
  const {data,error}=await (supabaseAdmin as any).rpc('open_family_coach_thread',{p_family_user_id:user.id,p_coach_id:coachId,p_athlete_id:athleteId})
  if(error){const code=String(error.message||'').includes('blocked')?'coach_messaging_blocked':String(error.message||'').includes('messaging_unavailable')?'coach_messaging_unavailable':'coach_unavailable';return fail(code,code==='coach_messaging_blocked'?'Messaging is unavailable for this coach.':code==='coach_messaging_unavailable'?'This coach is not accepting direct messages.':'This coach is unavailable.',code==='coach_unavailable'?404:409)}
  const row=Array.isArray(data)?data[0]:data
  return NextResponse.json({thread_id:row.thread_id,conversation_id:`thread:${row.thread_id}`,reused:Boolean(row.reused)})
}
