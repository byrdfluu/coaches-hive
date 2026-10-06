import {NextResponse}from'next/server'
import {requireMobileOrgAuthority}from'@/lib/mobilePaymentApi'
import {supabaseAdmin}from'@/lib/supabaseAdmin'
import {parseUuid}from'@/lib/uuid'
import {mobileContractError}from'@/lib/mobileApiContract'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const auth=await requireMobileOrgAuthority(request,'manage_schedule');if('response'in auth)return auth.response;const id=parseUuid((await params).id),body=await request.json().catch(()=>({})),scope=String(body.scope||'occurrence'),reason=String(body.reason||'').trim();if(!id||!['occurrence','future','series'].includes(scope)||!reason)return mobileContractError('cancellation_invalid','Occurrence, scope, and reason are required.',422,false)
 const{data,error}=await(supabaseAdmin as any).rpc('cancel_org_training_occurrences',{p_actor:auth.user.id,p_session:id,p_scope:scope,p_reason:reason});if(error)return mobileContractError(String(error.message||'').includes('forbidden')?'cancellation_forbidden':'cancellation_unavailable','The selected occurrences could not be canceled.',409,false)
 return NextResponse.json({status:'canceled',scope,occurrences_canceled:Number(data||0),refunds_required:true,refund_behavior:'Each paid occurrence requires its own organization-managed refund request.'})}
