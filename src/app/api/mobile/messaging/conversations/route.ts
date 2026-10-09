import {NextResponse} from 'next/server'
import {randomUUID} from 'node:crypto'
import {getMobileRequestUser} from '@/lib/mobileRequestAuth'
import {mobileApiError,mobileContractError} from '@/lib/mobileApiContract'
import {resolveAuthorizedAthleteContext} from '@/lib/authorizedAthleteContext'
import {authorizeWorkspaceRequest,workspaceCan} from '@/lib/workspaceAuthority'
import {familyRecipients,organizationRecipients,openMappedThread,type MobileRecipient,type RecipientType} from '@/lib/mobileMessagingRecipients'
import {parseUuid} from '@/lib/uuid'
import {supabaseAdmin} from '@/lib/supabaseAdmin'
export const dynamic='force-dynamic'
const fail=(code:string,message:string,status:number,retryable=false)=>mobileContractError(code,message,status,retryable)

export async function POST(request:Request){
  const requestId=parseUuid(request.headers.get('x-request-id'))||randomUUID()
  const user=await getMobileRequestUser(request);if(!user)return fail('unauthorized','Authentication is required.',401)
  const key=parseUuid(request.headers.get('idempotency-key')),body=await request.json().catch(()=>({}));if(!key)return fail('idempotency_key_required','A valid Idempotency-Key is required.',422)
  const {error:rateError}=await supabaseAdmin.rpc('assert_payment_action_rate_limit',{p_actor_user_id:user.id,p_action:'messaging_conversation_open',p_resource_key:'direct',p_max_attempts:15,p_window_seconds:60})
  if(rateError)return fail('messaging_rate_limited','Too many conversation requests. Please wait a moment and try again.',429)
  const recipientId=parseUuid(body.recipient_id),athleteId=parseUuid(body.athlete_profile_id),senderOrgId=parseUuid(body.sender_organization_id),type=String(body.recipient_type||'') as RecipientType
  const initialMessage=typeof body.initial_message==='string'?body.initial_message.trim():''
  if(body.initial_message!==undefined&&!initialMessage)return mobileContractError('initial_message_invalid','Enter a message before sending.',422,false,{initial_message:'Enter a message before sending.'})
  if(initialMessage.length>5000)return mobileContractError('initial_message_too_long','The message must be 5,000 characters or fewer.',422,false,{initial_message:'The message must be 5,000 characters or fewer.'})
  if(!recipientId||!['parent_athlete','coach','program_director','organization','user'].includes(type))return fail('recipient_invalid','Choose a valid recipient.',422)
  let rows:MobileRecipient[]=[],senderOrganizationId:string|null=null
  if(senderOrgId){const authority=await authorizeWorkspaceRequest({request,userId:user.id,body:{organization_id:senderOrgId},expectedType:'organization'});if(!authority.ok)return fail(authority.code,'Organization workspace access is unavailable.',authority.status)
    if(!workspaceCan(authority.workspace,'manage_messages')&&!workspaceCan(authority.workspace,'send_messages'))return fail('messaging_permission_denied','You do not have permission to message from this organization.',403);senderOrganizationId=authority.workspace.organizationId;rows=await organizationRecipients(user.id,authority.workspace,`id:${recipientId}`,20)
  }else{if(!athleteId||!await resolveAuthorizedAthleteContext(user.id,athleteId))return fail('ATHLETE_PROFILE_UNAVAILABLE','Athlete profile is unavailable.',404);rows=await familyRecipients(user.id,athleteId,'',20)
    // Resolve a non-recent requested recipient through a targeted, privacy-safe search.
    if(!rows.some(row=>row.recipient_type===type&&row.recipient_id===recipientId))rows=await familyRecipients(user.id,athleteId,`id:${recipientId}`,20)
  }
  let recipient=rows.find(row=>row.recipient_type===type&&row.recipient_id===recipientId)
  if(!recipient)return fail('recipient_unavailable','This recipient is unavailable.',404)
  if(!recipient.can_message)return fail(recipient.message_unavailable_reason==='blocked'?'messaging_blocked':'messaging_unavailable','Messaging is unavailable for this recipient.',409)
  if(initialMessage){const resolvedUserId=recipient.user_id||await resolveOrganizationContact(recipient.organization_id);if(!resolvedUserId)return fail('organization_inbox_unavailable','This organization does not have an available messaging contact.',409)
    const {data,error}=await (supabaseAdmin as any).rpc('open_mobile_conversation_with_message',{p_sender_user_id:user.id,p_sender_organization_id:senderOrganizationId,p_recipient_type:type,p_recipient_id:recipient.recipient_id,p_athlete_profile_id:athleteId,p_resolved_recipient_user_id:resolvedUserId,p_thread_organization_id:senderOrganizationId||recipient.organization_id,p_title:recipient.display_name,p_initial_message:initialMessage,p_idempotency_key:key})
    if(error){
      console.error('[mobile/messaging/conversations] atomic open failed',{request_id:requestId,stage:'open_mobile_conversation_with_message',provider_code:String(error.code||'unknown'),provider_message:String(error.message||''),provider_details:String(error.details||''),provider_hint:String(error.hint||'')})
      // Compatibility path for databases that are still applying the atomic
      // RPC migration. Both operations remain server-authorized and the send
      // RPC is idempotent, so a retry cannot duplicate the first message.
      try{
        const opened=await openMappedThread({senderUserId:user.id,senderOrganizationId,recipient,resolvedUserId,athleteId})
        const {data:sent,error:sendError}=await(supabaseAdmin as any).rpc('send_mobile_thread_message',{p_actor_user_id:user.id,p_thread_id:opened.threadId,p_content:initialMessage,p_attachment:{},p_idempotency_key:key})
        if(sendError)throw sendError
        const sentRow=Array.isArray(sent)?sent[0]:sent
        await reconcileOrganizationIdentity(opened.threadId,senderOrganizationId)
        return NextResponse.json({thread_id:opened.threadId,message_id:sentRow?.message_id,reused:opened.reused,message_status:'sent'})
      }catch(fallbackError:any){console.error('[mobile/messaging/conversations] fallback send failed',{request_id:requestId,stage:'fallback_send',provider_code:String(fallbackError?.code||'unknown'),provider_message:String(fallbackError?.message||''),provider_details:String(fallbackError?.details||''),provider_hint:String(fallbackError?.hint||'')})}
      return mobileApiError({code:'conversation_send_failed',message:'The conversation could not be started. Please try again.',status:503,retryable:true,requestId})
    }const row=Array.isArray(data)?data[0]:data;await reconcileOrganizationIdentity(row.thread_id,senderOrganizationId);return NextResponse.json({thread_id:row.thread_id,message_id:row.message_id,reused:Boolean(row.reused),message_status:'sent'})}
  if(!senderOrganizationId&&type==='organization'){const {data,error}=await (await import('@/lib/supabaseAdmin')).supabaseAdmin.rpc('open_family_contact_thread',{p_family_user_id:user.id,p_org_id:recipient.organization_id,p_athlete_id:athleteId});if(error)return fail('messaging_unavailable','This organization is not accepting messages.',409);const row=Array.isArray(data)?data[0]:data;return NextResponse.json({thread_id:row.thread_id,reused:Boolean(row.reused)})}
  if(!senderOrganizationId&&type==='coach'&&!recipient.organization_id){const {data,error}=await (await import('@/lib/supabaseAdmin')).supabaseAdmin.rpc('open_family_coach_thread',{p_family_user_id:user.id,p_coach_id:recipient.user_id,p_athlete_id:athleteId});if(error)return fail('messaging_unavailable','This coach is not accepting messages.',409);const row=Array.isArray(data)?data[0]:data;return NextResponse.json({thread_id:row.thread_id,reused:Boolean(row.reused)})}
  if(!senderOrganizationId&&type==='parent_athlete'){const {data,error}=await (supabaseAdmin as any).rpc('open_public_family_thread',{p_sender_user_id:user.id,p_recipient_user_id:recipient.user_id,p_athlete_id:athleteId});if(error)return fail(String(error.message||'').includes('messaging_blocked')?'messaging_blocked':'messaging_unavailable','Messaging is unavailable for this recipient.',409);const row=Array.isArray(data)?data[0]:data;return NextResponse.json({thread_id:row.thread_id,reused:Boolean(row.reused)})}
  const resolvedUserId=recipient.user_id||await resolveOrganizationContact(recipient.organization_id);if(!resolvedUserId)return fail('organization_inbox_unavailable','This organization does not have an available messaging contact.',409)
  try{const opened=await openMappedThread({senderUserId:user.id,senderOrganizationId,recipient,resolvedUserId,athleteId});await reconcileOrganizationIdentity(opened.threadId,senderOrganizationId);return NextResponse.json({thread_id:opened.threadId,reused:opened.reused})}catch{return fail('conversation_unavailable','The conversation could not be opened.',503,true)}
}
async function resolveOrganizationContact(orgId:string|null){if(!orgId)return null;const {supabaseAdmin}=await import('@/lib/supabaseAdmin');const {data}=await supabaseAdmin.from('org_settings').select('primary_family_contact_user_id').eq('org_id',orgId).maybeSingle();return data?.primary_family_contact_user_id||null}
async function reconcileOrganizationIdentity(threadId:string,orgId:string|null){if(orgId)await(supabaseAdmin as any).rpc('reconcile_mobile_thread_organization',{p_thread_id:threadId,p_org_id:orgId})}
