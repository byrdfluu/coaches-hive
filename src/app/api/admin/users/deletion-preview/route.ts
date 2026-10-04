import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { logAdminAction } from '@/lib/auditLog'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'

const count = async (table:string,column:string,userId:string) => {
  const { count: total } = await supabaseAdmin.from(table).select('*',{count:'exact',head:true}).eq(column,userId)
  return total || 0
}

export async function POST(request:Request){
  const auth=await requireSuperadminApi(request);if(auth.error)return auth.error
  const body=await request.json().catch(()=>({})),userId=parseUuid(body.user_id)
  if(!userId)return NextResponse.json({error:'A valid user_id is required.'},{status:422})
  const [{data:profile},{data:owned},{data:athletes},financialRecords,subscriptions,connectAccounts,refunds,signedDocuments]=await Promise.all([
    supabaseAdmin.from('profiles').select('id,email,full_name,role').eq('id',userId).maybeSingle(),
    supabaseAdmin.from('business_workspaces').select('id,workspace_type,display_name,status,organization_id,league_id,owner_user_id').eq('owner_user_id',userId),
    supabaseAdmin.from('athlete_profiles').select('id,full_name,status,is_primary').or(`owner_user_id.eq.${userId},auth_user_id.eq.${userId}`),
    count('payment_transactions','payer_id',userId),count('platform_subscriptions','user_id',userId),
    count('stripe_connect_accounts','owner_id',userId),count('payment_refund_requests','requester_id',userId),
    count('coach_waiver_assignments','signed_by_user_id',userId),
  ])
  if(!profile)return NextResponse.json({error:'User not found.'},{status:404})
  const blockingReasons:string[]=[]
  if((owned||[]).length)blockingReasons.push('workspace_ownership_must_be_transferred')
  if(financialRecords)blockingReasons.push('protected_financial_records_exist')
  if(subscriptions)blockingReasons.push('subscriptions_must_be_resolved')
  if(connectAccounts)blockingReasons.push('stripe_connect_accounts_must_be_resolved')
  if(refunds)blockingReasons.push('refund_records_must_be_retained')
  if(signedDocuments)blockingReasons.push('signed_documents_must_be_retained')
  const result={can_delete:blockingReasons.length===0,recommended_action:(owned||[]).length?'transfer_ownership':blockingReasons.length?'retain_or_anonymize':'delete',
    owned_workspaces:owned||[],athlete_profiles:athletes||[],financial_records:financialRecords,subscriptions,
    stripe_connect_accounts:connectAccounts,refunds,signed_documents:signedDocuments,blocking_reasons:blockingReasons}
  await logAdminAction({action:'admin.user.deletion_preview',actorId:auth.user.id,actorEmail:auth.user.email,targetType:'user',targetId:userId,
    metadata:{can_delete:result.can_delete,blocking_reasons:blockingReasons}})
  return NextResponse.json(result)
}
