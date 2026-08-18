import { NextResponse } from 'next/server'
import { createCanonicalPaymentIntent } from '@/lib/canonicalPaymentIntent'
import { mobileError, requireIdempotencyKey, requireMobileUser, userCanAccessPlayer } from '@/lib/mobilePaymentApi'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const auth=await requireMobileUser(request);if('response'in auth)return auth.response;const{id}=await params;const body=await request.json().catch(()=>({}));const key=requireIdempotencyKey(body);if(!key)return mobileError('idempotency_key is required and must contain at least 8 characters')
 const {data:form}=await supabaseAdmin.from('org_enrollment_forms').select('*').eq('id',id).eq('is_active',true).maybeSingle();if(!form)return mobileError('Registration not found',404)
 const submissionId=String(body.submission_id||'');const{data:submission}=await supabaseAdmin.from('org_enrollment_submissions').select('*').eq('id',submissionId).eq('form_id',id).maybeSingle();if(!submission)return mobileError('Submission not found',404)
 if(!submission.player_id||!(await userCanAccessPlayer(auth.user.id,submission.player_id))||submission.family_account_id!==auth.user.id)return mobileError('Forbidden',403)
 const phase=submission.pricing_phase||'standard';let amount=Number(submission.amount_due_cents??(phase==='early_bird'?form.early_bird_fee_cents:phase==='late'?form.late_fee_cents:form.enrollment_fee_cents))||0
 if(amount<=0)return mobileError('This registration does not require payment',409)
 try{return NextResponse.json(await createCanonicalPaymentIntent({userId:auth.user.id,idempotencyKey:key,transactionType:'registration',sourceRecordType:'org_enrollment_submission',sourceRecordId:submission.id,amountCents:amount,description:form.title,orgId:form.org_id,payerId:auth.user.id,playerId:submission.player_id,teamId:form.team_id,seasonId:form.season_id,metadata:{registrationId:form.id,submissionId:submission.id,pricingPhase:phase,registrationSource:submission.registration_source||'in_app'}}))}catch(error){return mobileError(error instanceof Error?error.message:'Unable to create payment',409)}
}
