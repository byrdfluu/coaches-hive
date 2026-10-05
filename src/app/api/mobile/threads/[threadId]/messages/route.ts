import {NextResponse} from 'next/server'
import {requireMobileThread} from '@/lib/mobileThreadManagement'
import {mobileContractError} from '@/lib/mobileApiContract'
import {parseUuid} from '@/lib/uuid'
import {supabaseAdmin} from '@/lib/supabaseAdmin'

const fail=(code:string,message:string,status:number,retryable=false)=>mobileContractError(code,message,status,retryable)
const decode=(value:string|null)=>{if(!value)return{cursor:null,error:null};try{const row=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));if(typeof row.created_at!=='string'||!parseUuid(row.id)||typeof row.expires_at!=='string')return{cursor:null,error:'invalid'};if(Date.parse(row.expires_at)<=Date.now())return{cursor:null,error:'expired'};return{cursor:row,error:null}}catch{return{cursor:null,error:'invalid'}}}
const encode=(row:{created_at:string;id:string})=>Buffer.from(JSON.stringify({created_at:row.created_at,id:row.id,expires_at:new Date(Date.now()+86400000).toISOString()})).toString('base64url')

export async function GET(request:Request,{params}:{params:Promise<{threadId:string}>}){
  const threadId=parseUuid((await params).threadId);if(!threadId)return fail('thread_unavailable','Conversation is unavailable.',404)
  const access=await requireMobileThread(request,threadId);if('response'in access)return access.response
  const url=new URL(request.url),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||50)),decoded=decode(url.searchParams.get('cursor')),cursor=decoded.cursor
  if(decoded.error==='expired')return fail('message_cursor_expired','Message history changed. Refresh the conversation.',410)
  if(decoded.error)return fail('message_cursor_invalid','Refresh the conversation and try again.',422)
  const {data,error}=await(supabaseAdmin as any).rpc('mobile_thread_messages_page',{p_actor_user_id:access.user.id,p_thread_id:threadId,p_limit:limit+1,p_before_created_at:cursor?.created_at||null,p_before_id:cursor?.id||null})
  if(error)return fail('messages_unavailable','Messages are temporarily unavailable.',503,true)
  const rows=data||[],more=rows.length>limit,items=rows.slice(0,limit),last=items.at(-1)
  return NextResponse.json({messages:items,next_cursor:more&&last?encode(last):null},{headers:{'Cache-Control':'private, no-store'}})
}

export async function POST(request:Request,{params}:{params:Promise<{threadId:string}>}){
  const threadId=parseUuid((await params).threadId),key=parseUuid(request.headers.get('idempotency-key'));if(!threadId)return fail('thread_unavailable','Conversation is unavailable.',404);if(!key)return fail('idempotency_key_required','A valid Idempotency-Key is required.',422)
  const access=await requireMobileThread(request,threadId);if('response'in access)return access.response
  const body=await request.json().catch(()=>({})),content=typeof body.content==='string'?body.content.trim():'',attachment=body.attachment&&typeof body.attachment==='object'?body.attachment:null
  if(!content&&!attachment)return fail('message_content_required','Enter a message or choose an attachment.',422)
  if(content.length>5000)return fail('message_too_long','The message must be 5,000 characters or fewer.',422)
  if(attachment&&(!['image','video','audio','document','file'].includes(String(attachment.type||''))||typeof attachment.storage_path!=='string'||!attachment.storage_path.trim()))return fail('attachment_invalid','Choose a valid attachment.',422)
  if(attachment&&Number(attachment.size_bytes||0)>25*1024*1024)return fail('attachment_too_large','Attachments must be 25 MB or smaller.',422)
  const {error:rateError}=await supabaseAdmin.rpc('assert_payment_action_rate_limit',{p_actor_user_id:access.user.id,p_action:'mobile_message_send',p_resource_key:threadId,p_max_attempts:60,p_window_seconds:60})
  if(rateError)return fail('messaging_rate_limited','Too many messages were sent. Please wait and try again.',429,true)
  const {data,error}=await(supabaseAdmin as any).rpc('send_mobile_thread_message',{p_actor_user_id:access.user.id,p_thread_id:threadId,p_content:content,p_attachment:attachment||{},p_idempotency_key:key})
  if(error){const code=String(error.message||'').includes('messaging_blocked')?'messaging_blocked':'message_send_failed';return fail(code,code==='messaging_blocked'?'Messaging is unavailable for this recipient.':'The message could not be sent.',code==='messaging_blocked'?409:503,code!=='messaging_blocked')}
  const row=Array.isArray(data)?data[0]:data;return NextResponse.json({message_id:row.message_id,status:row.delivery_status,created_at:row.created_at,reused:Boolean(row.reused)},{status:row.reused?200:201})
}
