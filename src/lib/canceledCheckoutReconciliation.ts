import stripe from '@/lib/stripeServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const activeAttemptStatuses=['processing','checkout_pending']

export async function reconcileCanceledCheckout(input:{recordId:string;checkoutType:string;buyerUserId?:string|null}){
  const checkoutTypes=input.checkoutType.startsWith('recurring_')?[input.checkoutType]
    :[input.checkoutType,`recurring_${input.checkoutType}`]
  let query=(supabaseAdmin as any).from('checkout_purchase_attempts').select('*')
    .or(`checkout_record_id.eq.${input.recordId},purchase_id.eq.${input.recordId}`)
    .in('checkout_type',checkoutTypes)
    .in('status',activeAttemptStatuses).order('created_at',{ascending:false}).limit(20)
  if(input.buyerUserId)query=query.eq('buyer_user_id',input.buyerUserId)
  const {data:attempts,error}=await query
  if(error)throw error
  let canceled=0,alreadyCompleted=0
  for(const attempt of attempts||[]){
    const session=attempt.stripe_checkout_session_id
      ?await stripe.checkout.sessions.retrieve(attempt.stripe_checkout_session_id).catch(()=>null):null
    const paid=Boolean(session?.status==='complete'&&(session.mode!=='payment'||['paid','no_payment_required'].includes(String(session.payment_status))))
    if(paid){
      alreadyCompleted+=1
      continue
    }
    if(session?.status==='open')await stripe.checkout.sessions.expire(session.id).catch(()=>undefined)
    await (supabaseAdmin as any).from('checkout_purchase_attempts').update({status:'canceled',updated_at:new Date().toISOString(),
      last_error_code:'checkout_canceled',last_error_message:'Customer returned from Stripe without completing Checkout.'})
      .eq('id',attempt.id).in('status',activeAttemptStatuses)
    if(String(attempt.checkout_type)==='training_package'){
      await supabaseAdmin.from('org_training_package_purchases').update({status:'canceled',stripe_checkout_session_id:null,updated_at:new Date().toISOString()})
        .eq('id',attempt.purchase_id).eq('status','pending').is('stripe_subscription_id',null)
    }
    if(String(attempt.checkout_type)==='program')await supabaseAdmin.from('program_registrations')
      .update({stripe_checkout_session_id:null}).eq('id',attempt.checkout_record_id).eq('status','pending').is('stripe_payment_intent_id',null)
    if(String(attempt.checkout_type)==='tryout')await supabaseAdmin.from('org_tryout_registrations')
      .update({stripe_checkout_session_id:null}).eq('id',attempt.checkout_record_id).eq('status','pending').is('stripe_payment_intent_id',null)
    if(String(attempt.checkout_type).startsWith('recurring_'))await (supabaseAdmin as any).from('offering_recurring_subscriptions')
      .update({status:'canceled',stripe_checkout_session_id:null,updated_at:new Date().toISOString()})
      .eq('id',attempt.checkout_record_id).in('status',['checkout_pending','incomplete']).is('stripe_subscription_id',null)
    if(String(attempt.checkout_type)==='recurring_fee')await (supabaseAdmin as any).from('organization_recurring_fees')
      .update({status:'canceled',stripe_checkout_session_id:null,updated_at:new Date().toISOString()})
      .eq('id',attempt.checkout_record_id).eq('status','checkout_pending').is('stripe_subscription_id',null)
    canceled+=1
  }
  return{canceled,already_completed:alreadyCompleted}
}
