import {NextResponse} from 'next/server'
import {getMobileRequestUser} from '@/lib/mobileRequestAuth'
import {mobileContractError} from '@/lib/mobileApiContract'
import {resolveAuthorizedAthleteContext} from '@/lib/authorizedAthleteContext'
import {authorizeWorkspaceRequest,workspaceCan} from '@/lib/workspaceAuthority'
import {familyRecipients,organizationRecipients} from '@/lib/mobileMessagingRecipients'
import {parseUuid} from '@/lib/uuid'
import {supabaseAdmin} from '@/lib/supabaseAdmin'
import {randomUUID} from 'node:crypto'
export const dynamic='force-dynamic'
const fail=(code:string,message:string,status:number)=>mobileContractError(code,message,status,status>=500)

export async function GET(request:Request){
  const requestId=request.headers.get('x-request-id')||randomUUID()
  const user=await getMobileRequestUser(request);if(!user)return fail('unauthorized','Authentication is required.',401)
  const url=new URL(request.url),portal=url.searchParams.get('portal'),q=String(url.searchParams.get('q')||'').trim(),limit=Math.min(20,Math.max(1,Number(url.searchParams.get('limit'))||20))
  if(q.length===1)return fail('search_query_too_short','Enter at least two characters to search.',422)
  const {error:rateError}=await supabaseAdmin.rpc('assert_payment_action_rate_limit',{p_actor_user_id:user.id,p_action:'messaging_recipient_search',p_resource_key:portal||'unknown',p_max_attempts:60,p_window_seconds:60})
  if(rateError)return fail('messaging_rate_limited','Too many searches. Please wait a moment and try again.',429)
  if(portal==='family'){const athleteId=parseUuid(url.searchParams.get('athlete_profile_id'));if(!athleteId||!await resolveAuthorizedAthleteContext(user.id,athleteId))return fail('ATHLETE_PROFILE_UNAVAILABLE','Athlete profile is unavailable.',404)
    try{const recipients=await familyRecipients(user.id,athleteId,q,limit);logSearch(requestId,'family',recipients);return NextResponse.json({recipients},{headers:{'Cache-Control':'private, no-store','X-Request-ID':requestId}})}catch{console.warn('[messaging/recipients]',{request_id:requestId,portal:'family',outcome:'dependency_failure'});return fail('recipient_search_unavailable','Recipient search is temporarily unavailable. Please try again.',503)}}
  if(portal==='organization'){const authority=await authorizeWorkspaceRequest({request,userId:user.id,expectedType:'organization'});if(!authority.ok)return fail(authority.code,'Organization workspace access is unavailable.',authority.status)
    if(!workspaceCan(authority.workspace,'manage_messages')&&!workspaceCan(authority.workspace,'send_messages'))return fail('messaging_permission_denied','You do not have permission to message from this organization.',403)
    try{const recipients=await organizationRecipients(user.id,authority.workspace,q,limit);logSearch(requestId,'organization',recipients);return NextResponse.json({recipients},{headers:{'Cache-Control':'private, no-store','X-Request-ID':requestId}})}catch{console.warn('[messaging/recipients]',{request_id:requestId,portal:'organization',outcome:'dependency_failure'});return fail('recipient_search_unavailable','Recipient search is temporarily unavailable. Please try again.',503)}}
  return fail('portal_invalid','Choose a valid messaging portal.',422)
}
function logSearch(requestId:string,portal:string,recipients:Array<{can_message:boolean;message_unavailable_reason:string|null}>){const reasons=recipients.reduce<Record<string,number>>((out,row)=>{const key=row.can_message?'eligible':row.message_unavailable_reason||'unavailable';out[key]=(out[key]||0)+1;return out},{});console.info('[messaging/recipients]',{request_id:requestId,portal,matched_candidate_count:recipients.length,exclusion_reasons:Object.keys(reasons).length?reasons:{no_safe_matches:1}})}
