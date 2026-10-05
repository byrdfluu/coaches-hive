import {NextResponse}from'next/server'
import {requireMobileThread}from'@/lib/mobileThreadManagement'
import {mobileContractError}from'@/lib/mobileApiContract'
import {parseUuid}from'@/lib/uuid'
import {supabaseAdmin}from'@/lib/supabaseAdmin'
export async function POST(request:Request,{params}:{params:Promise<{threadId:string}>}){const threadId=parseUuid((await params).threadId);if(!threadId)return mobileContractError('thread_unavailable','Conversation is unavailable.',404);const access=await requireMobileThread(request,threadId);if('response'in access)return access.response;const body=await request.json().catch(()=>({})),messageId=body.message_id?parseUuid(body.message_id):null;if(body.message_id&&!messageId)return mobileContractError('message_invalid','Choose a valid message.',422);const{data,error}=await(supabaseAdmin as any).rpc('mark_mobile_thread_read',{p_actor_user_id:access.user.id,p_thread_id:threadId,p_through_message_id:messageId});if(error)return mobileContractError('message_read_update_failed','Read status could not be updated.',503,true);return NextResponse.json({thread_id:threadId,read_at:data})}
