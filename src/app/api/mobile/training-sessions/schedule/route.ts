import {NextResponse}from'next/server'
import {getMobileRequestUser}from'@/lib/mobileRequestAuth'
import {resolveAuthorizedAthleteContext}from'@/lib/authorizedAthleteContext'
import {supabaseAdmin}from'@/lib/supabaseAdmin'
import {parseUuid}from'@/lib/uuid'
import {mobileContractError}from'@/lib/mobileApiContract'
export async function GET(request:Request){const user=await getMobileRequestUser(request);if(!user)return mobileContractError('unauthorized','Authentication is required.',401,false);const athleteId=parseUuid(new URL(request.url).searchParams.get('athlete_profile_id'));if(!athleteId||!await resolveAuthorizedAthleteContext(user.id,athleteId))return mobileContractError('athlete_unavailable','The selected athlete is unavailable.',404,false)
 const{data,error}=await supabaseAdmin.from('org_training_session_bookings').select('id,status,booking_type,booked_at,org_training_sessions!inner(id,org_id,series_id,title,description,starts_at,ends_at,timezone,location,session_type,status)').eq('athlete_id',athleteId).in('status',['reserved','attended','no_show']).gte('org_training_sessions.starts_at',new Date().toISOString()).order('starts_at',{referencedTable:'org_training_sessions'});if(error)return mobileContractError('schedule_unavailable','The athlete schedule is temporarily unavailable.',503,true);return NextResponse.json({athlete_profile_id:athleteId,occurrences:data||[]})}
