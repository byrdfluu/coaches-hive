import {NextResponse} from 'next/server'
import {getMobileRequestUser} from '@/lib/mobileRequestAuth'
import {mobileContractError} from '@/lib/mobileApiContract'
import {resolveAuthorizedAthleteContext} from '@/lib/authorizedAthleteContext'
import {authorizeWorkspaceRequest,workspaceCan} from '@/lib/workspaceAuthority'
import {familyRecipients,organizationRecipients} from '@/lib/mobileMessagingRecipients'
import {parseUuid} from '@/lib/uuid'
export const dynamic='force-dynamic'
const fail=(code:string,message:string,status:number)=>mobileContractError(code,message,status,status>=500)

export async function GET(request:Request){
  const user=await getMobileRequestUser(request);if(!user)return fail('unauthorized','Authentication is required.',401)
  const url=new URL(request.url),portal=url.searchParams.get('portal'),q=String(url.searchParams.get('q')||'').trim(),limit=Math.min(20,Math.max(1,Number(url.searchParams.get('limit'))||20))
  if(q.length===1)return fail('search_query_too_short','Enter at least two characters to search.',422)
  if(portal==='family'){const athleteId=parseUuid(url.searchParams.get('athlete_profile_id'));if(!athleteId||!await resolveAuthorizedAthleteContext(user.id,athleteId))return fail('ATHLETE_PROFILE_UNAVAILABLE','Athlete profile is unavailable.',404)
    return NextResponse.json({recipients:await familyRecipients(user.id,athleteId,q,limit)},{headers:{'Cache-Control':'private, no-store'}})}
  if(portal==='organization'){const authority=await authorizeWorkspaceRequest({request,userId:user.id,expectedType:'organization'});if(!authority.ok)return fail(authority.code,'Organization workspace access is unavailable.',authority.status)
    if(!workspaceCan(authority.workspace,'manage_messages')&&!workspaceCan(authority.workspace,'send_messages'))return fail('messaging_permission_denied','You do not have permission to message from this organization.',403)
    return NextResponse.json({recipients:await organizationRecipients(user.id,authority.workspace,q,limit)},{headers:{'Cache-Control':'private, no-store'}})}
  return fail('portal_invalid','Choose a valid messaging portal.',422)
}
