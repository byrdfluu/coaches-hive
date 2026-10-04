import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { reconcileCanceledCheckout } from '@/lib/canceledCheckoutReconciliation'
import { mobileContractError } from '@/lib/mobileApiContract'
import { parseUuid } from '@/lib/uuid'
import stripe from '@/lib/stripeServer'
import {verifyMobileCheckoutToken} from '@/lib/mobileCheckoutToken'
import {supabaseAdmin} from '@/lib/supabaseAdmin'

export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function POST(request:Request){
  const body=await request.json().catch(()=>({}))
  const legacyToken=String(body?.token||'').trim(),legacyRecordId=parseUuid(body?.record_id)
  if(legacyToken&&legacyRecordId){
    try{
      const claims=verifyMobileCheckoutToken(legacyToken)
      if(claims.type!=='coach_fee'||claims.resourceId!==legacyRecordId)return mobileContractError('checkout_cancellation_forbidden','This checkout cannot be canceled by the current user.',403,false)
      const {data:assignment,error}=await supabaseAdmin.from('coach_fee_assignments').select('id,status,stripe_checkout_session_id').eq('id',legacyRecordId).maybeSingle()
      if(error)throw error
      if(!assignment)return mobileContractError('checkout_unavailable','This checkout is unavailable.',404,false)
      if(assignment.status==='paid')return mobileContractError('checkout_already_paid','A completed checkout cannot be canceled.',409,false)
      if(assignment.status==='canceled')return NextResponse.json({canceled:true,status:'canceled'})
      if(!assignment.stripe_checkout_session_id)return mobileContractError('checkout_not_cancelable','This checkout can no longer be canceled.',409,false)
      const session=await stripe.checkout.sessions.retrieve(assignment.stripe_checkout_session_id)
      const sessionOwner=session.client_reference_id||session.metadata?.payer_user_id
      if(session.metadata?.checkout_type!=='coach_fee'||session.metadata?.assignment_id!==assignment.id||sessionOwner!==claims.userId||session.payment_status==='paid')return mobileContractError('checkout_not_cancelable','This checkout can no longer be canceled.',409,false)
      if(session.status==='open')await stripe.checkout.sessions.expire(session.id)
      const {error:updateError}=await supabaseAdmin.from('coach_fee_assignments').update({status:'canceled',updated_at:new Date().toISOString()}).eq('id',assignment.id).eq('stripe_checkout_session_id',session.id).in('status',['pending','expired'])
      if(updateError)throw updateError
      return NextResponse.json({canceled:true,status:'canceled'})
    }catch(error){
      console.error('[mobile/checkout/cancel] legacy reconciliation failed',{code:error&&typeof error==='object'&&'code'in error?(error as any).code:'unknown'})
      return mobileContractError('checkout_cancellation_failed','Unable to cancel checkout.',503,true)
    }
  }
  const user=await getMobileRequestUser(request)
  if(!user)return mobileContractError('unauthorized','Authentication is required.',401,false)
  const recordId=parseUuid(body?.id||body?.checkout_record_id||body?.purchase_id)
  const checkoutType=String(body?.type||body?.checkout_type||'').trim().toLowerCase()
  if(!recordId||!checkoutType)return mobileContractError('checkout_cancellation_invalid','Checkout type and record ID are required.',422,false)
  try{
    const result=await reconcileCanceledCheckout({recordId,checkoutType,buyerUserId:user.id})
    return NextResponse.json({status:'canceled',checkout_type:checkoutType,checkout_record_id:recordId,...result},{headers:{'Cache-Control':'no-store'}})
  }catch(error){
    console.error('[mobile/checkout/cancel] reconciliation failed',{code:error&&typeof error==='object'&&'code'in error?(error as any).code:'unknown'})
    return mobileContractError('checkout_cancellation_failed','Checkout cancellation could not be confirmed yet.',503,true)
  }
}
