import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import { queueOperationTask } from '@/lib/operations'
import { insertNotifications } from '@/lib/inAppNotifications'
import stripe from '@/lib/stripeServer'

export const dynamic = 'force-dynamic'
const fail=(error:string,status=400)=>NextResponse.json({error},{status})

export async function POST(request:Request){
  const auth=await requireSuperadminApi(request);if(auth.error)return auth.error
  const body=await request.json().catch(()=>({}));const action=String(body.action||'');const id=String(body.id||'');const reason=String(body.reason||'').trim()
  if(!action||!id||!reason)return fail('action, id, and reason are required')
  let result:Record<string,unknown>={}
  if(action==='refresh_connect'){
    const {data:row}=await supabaseAdmin.from('stripe_connect_accounts').select('*').eq('id',id).maybeSingle()
    const accountId=row?.stripe_account_id||id;if(!accountId)return fail('Connect account not found',404)
    const account=await stripe.accounts.retrieve(accountId)
    const requirements=account.requirements?.currently_due||[]
    const update={charges_enabled:account.charges_enabled,payouts_enabled:account.payouts_enabled,requirements_due:requirements,disabled_reason:account.requirements?.disabled_reason||null,connect_status:account.charges_enabled&&account.payouts_enabled?'enabled':requirements.length?'action_required':'pending',updated_at:new Date().toISOString()}
    const {error}=await supabaseAdmin.from('stripe_connect_accounts').update(update).eq('stripe_account_id',accountId);if(error)return fail(error.message,500);result=update
  }else if(action==='invalidate_push_token'){
    const {error}=await supabaseAdmin.from('device_tokens').delete().eq('id',id);if(error)return fail(error.message,500);result={invalidated:true}
  }else if(action==='test_push'){
    const {data:token}=await supabaseAdmin.from('device_tokens').select('user_id').eq('id',id).maybeSingle();if(!token)return fail('Device token not found',404)
    await insertNotifications([{user_id:token.user_id,type:'admin_push_test',title:'Coaches Hive test notification',body:'Push delivery was requested by a platform administrator.',action_url:'/',data:{admin_test:true}}]);result={queued:true,user_id:token.user_id}
  }else if(action==='reconcile_handoff'){
    const {data:handoff}=await supabaseAdmin.from('mobile_checkout_handoffs').select('*').eq('nonce',id).maybeSingle();if(!handoff)return fail('Handoff not found',404)
    if(!handoff.stripe_checkout_session_id)return fail('Handoff has no Stripe checkout session',422)
    const session=await stripe.checkout.sessions.retrieve(handoff.stripe_checkout_session_id)
    const fulfilled=session.payment_status==='paid'||session.status==='complete'
    const update={status:fulfilled?'fulfilled':session.status==='expired'?'expired':'processing',fulfilled_at:fulfilled?(handoff.fulfilled_at||new Date().toISOString()):null,last_error:null,updated_at:new Date().toISOString()}
    const {error}=await supabaseAdmin.from('mobile_checkout_handoffs').update(update).eq('nonce',id);if(error)return fail(error.message,500);result=update
  }else if(['retry_billing','reconcile_accounting','retry_webhook'].includes(action)){
    const task=await queueOperationTask({type:action,title:`Admin requested ${action.replaceAll('_',' ')}`,priority:'high',owner:'Platform Ops',entity_type:action==='retry_webhook'?'webhook':'payment',entity_id:id,max_attempts:5,idempotency_key:`admin:${action}:${id}:${new Date().toISOString().slice(0,13)}`,metadata:{reason,requested_by:auth.user.id}})
    result={task_id:task?.id||null,status:'queued'}
  }else return fail('Unsupported operational action')
  await logAdminAction({action:`admin.operations.${action}`,actorId:auth.user.id,actorEmail:auth.user.email||null,targetType:'operational_record',targetId:id,metadata:{reason,...result}})
  return NextResponse.json({ok:true,result})
}
