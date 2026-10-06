import {randomUUID} from 'node:crypto'
import {NextResponse} from 'next/server'
import stripe from '@/lib/stripeServer'
import {getMobileRequestUser} from '@/lib/mobileRequestAuth'
import {mobileApiError} from '@/lib/mobileApiContract'
import {parseUuid} from '@/lib/uuid'
import {supabaseAdmin} from '@/lib/supabaseAdmin'
import {resolveAuthorizedAthleteContext} from '@/lib/authorizedAthleteContext'
import {isStripeConnectEnabled,loadStripeConnectAccountStatus} from '@/lib/stripeConnectAccounts'
import {calculateOrganizationPayment,organizationCheckoutLineItems,organizationPaymentMetadata} from '@/lib/organizationPaymentPolicy'
import {assertStripeHostedUrl} from '@/lib/paymentSecurity'
import {resolveBaseUrl} from '@/lib/siteUrl'
export const dynamic='force-dynamic'
const fail=(id:string,code:string,message:string,status:number,retryable=false)=>mobileApiError({requestId:id,code,message,status,retryable})
export async function POST(request:Request){
 const requestId=parseUuid(request.headers.get('x-request-id'))||randomUUID(),user=await getMobileRequestUser(request);if(!user)return fail(requestId,'unauthorized','Authentication is required.',401)
 const body=await request.json().catch(()=>({})),athleteId=parseUuid(body.athlete_profile_id||body.athlete_id),attemptId=parseUuid(body.checkout_attempt_id||body.checkout_record_id),headerKey=parseUuid(request.headers.get('idempotency-key')),bodyKey=parseUuid(body.idempotency_key)
 const sessionIds=Array.isArray(body.occurrence_ids)?body.occurrence_ids.map(parseUuid).filter(Boolean) as string[]:[]
 if(!athleteId||!headerKey||!bodyKey||headerKey!==bodyKey||!sessionIds.length||sessionIds.length>20||new Set(sessionIds).size!==sessionIds.length)return fail(requestId,'checkout_validation_failed','Choose valid training occurrences and try again.',422)
 if(!await resolveAuthorizedAthleteContext(user.id,athleteId))return fail(requestId,'athlete_unavailable','The selected athlete is unavailable.',404)
 if(attemptId){const{data:resume}=await supabaseAdmin.from('org_training_multi_checkout_attempts').select('id,athlete_id,payer_user_id,stripe_checkout_session_id,expires_at,status').eq('id',attemptId).eq('athlete_id',athleteId).eq('payer_user_id',user.id).maybeSingle();if(resume?.stripe_checkout_session_id&&resume.expires_at&&new Date(resume.expires_at)>new Date()&&['checkout_pending','processing'].includes(resume.status)){const prior=await stripe.checkout.sessions.retrieve(resume.stripe_checkout_session_id);if(prior.status==='open'&&prior.url)return NextResponse.json({checkout_url:assertStripeHostedUrl(prior.url),checkout_attempt_id:resume.id,expires_at:new Date(prior.expires_at*1000).toISOString(),reused:true})}}
 const {data:prepared,error:prepareError}=await(supabaseAdmin as any).rpc('prepare_org_training_multi_checkout',{p_payer:user.id,p_athlete:athleteId,p_sessions:sessionIds,p_key:headerKey});
 if(prepareError){const message=String(prepareError.message||'');const code=message.includes('capacity')?'occurrence_capacity_unavailable':message.includes('duplicate')?'duplicate_occurrence':message.includes('mixed')?'mixed_organizations':'occurrence_unavailable';return fail(requestId,code,code==='occurrence_capacity_unavailable'?'One or more selected sessions are full.':'One or more selected sessions are unavailable.',409)}
 const attempt=Array.isArray(prepared)?prepared[0]:prepared;if(!attempt)return fail(requestId,'checkout_unavailable','Unable to prepare checkout.',503,true)
 const [{data:existing},{data:profile},{data:workspace}]=await Promise.all([
  supabaseAdmin.from('org_training_multi_checkout_attempts').select('stripe_checkout_session_id,status,expires_at').eq('id',attempt.attempt_id).maybeSingle(),
  supabaseAdmin.from('profiles').select('email,stripe_customer_id').eq('id',user.id).maybeSingle(),
  supabaseAdmin.from('business_workspaces').select('id').eq('workspace_type','organization').eq('organization_id',attempt.org_id).eq('status','active').eq('is_test',false).limit(1).maybeSingle(),
 ])
 if(existing?.stripe_checkout_session_id&&existing.expires_at&&new Date(existing.expires_at)>new Date()){const prior=await stripe.checkout.sessions.retrieve(existing.stripe_checkout_session_id);if(prior.status==='open'&&prior.url)return NextResponse.json({checkout_url:assertStripeHostedUrl(prior.url),checkout_attempt_id:attempt.attempt_id,expires_at:new Date(prior.expires_at*1000).toISOString(),reused:true})}
 const connect=await loadStripeConnectAccountStatus('org',attempt.org_id,{refresh:true});if(!isStripeConnectEnabled(connect))return fail(requestId,'connect_setup_incomplete','This organization is still setting up payments.',409)
 if(!workspace)return fail(requestId,'workspace_unavailable','The organization workspace is unavailable.',409)
 let customerId=profile?.stripe_customer_id||null;if(!customerId){const customer=await stripe.customers.create({email:profile?.email||user.email||undefined,metadata:{coaches_hive_user_id:user.id}},{idempotencyKey:`training-session-customer:${user.id}`});customerId=customer.id;await supabaseAdmin.from('profiles').update({stripe_customer_id:customerId}).eq('id',user.id)}
 const payment=calculateOrganizationPayment(Number(attempt.base_amount_cents))
 const metadata={checkout_type:'training_multi_session',attempt_id:attempt.attempt_id,payment_record_id:attempt.attempt_id,athlete_profile_id:athleteId,payer_user_id:user.id,org_id:attempt.org_id,workspace_id:workspace.id,platformFeeCents:String(payment.platform_fee_cents),...organizationPaymentMetadata(payment)}
 try{const session=await stripe.checkout.sessions.create({mode:'payment',customer:customerId,payment_method_types:['card'],line_items:organizationCheckoutLineItems(`${sessionIds.length} training session${sessionIds.length===1?'':'s'}`,payment),metadata,payment_intent_data:{application_fee_amount:payment.application_fee_cents,transfer_data:{destination:connect!.stripeAccountId},on_behalf_of:connect!.stripeAccountId,metadata},success_url:`${resolveBaseUrl()}/mobile/payment-return?status=processing&type=training_multi_session&id=${attempt.attempt_id}`,cancel_url:`${resolveBaseUrl()}/mobile/payment-return?status=canceled&type=training_multi_session&id=${attempt.attempt_id}`,expires_at:Math.floor(Date.now()/1000)+30*60},{idempotencyKey:`training-multi:${attempt.attempt_id}:${headerKey}`});if(!session.url)throw new Error('missing_url');await supabaseAdmin.from('org_training_multi_checkout_attempts').update({stripe_checkout_session_id:session.id,status:'checkout_pending',expires_at:new Date(session.expires_at*1000).toISOString(),updated_at:new Date().toISOString()}).eq('id',attempt.attempt_id);return NextResponse.json({checkout_url:assertStripeHostedUrl(session.url),checkout_attempt_id:attempt.attempt_id,occurrence_ids:sessionIds,expires_at:new Date(session.expires_at*1000).toISOString(),fee_breakdown:{currency:'usd',base_amount_cents:payment.base_amount_cents,service_fee_cents:payment.service_fee_cents,total_cents:payment.total_cents},reused:false})}catch{return fail(requestId,'checkout_unavailable','Unable to start secure checkout.',503,true)}
}
