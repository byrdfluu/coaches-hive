import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseUuid } from '@/lib/uuid'

export const dynamic='force-dynamic'
type Issue={code:string;severity:'warning'|'error';message:string}
const today=()=>new Date().toISOString()
const inspect=(type:string,row:any):Issue[]=>{
  const issues:Issue[]=[]
  const title=row.title||row.name||row.description
  const status=String(row.status??(row.is_active?'active':'draft')).toLowerCase()
  const published=['published','active','open','available'].includes(status)||row.is_active===true
  const billing=String(row.billing_type||((Number(row.amount_cents||row.price_cents||row.price||0)>0)?'one_time':'free'))
  const interval=row.billing_interval||row.interval||null
  const amount=Number(row.amount_cents??row.price_cents??(Number(row.price||0)*100)??0)
  if(published&&!title)issues.push({code:'missing_title',severity:'error',message:'Published offering is missing a customer-facing title.'})
  if(published&&!row.image_url)issues.push({code:'missing_image',severity:'warning',message:'Published offering has no image.'})
  if(billing==='recurring'&&!['month','year'].includes(String(interval)))issues.push({code:'invalid_billing_interval',severity:'error',message:'Recurring billing requires a monthly or yearly interval.'})
  if((billing==='free'||billing==='one_time')&&interval)issues.push({code:'unexpected_billing_interval',severity:'error',message:'Free and one-time offerings cannot have a billing interval.'})
  if(billing!=='free'&&amount<=0)issues.push({code:'missing_price',severity:'error',message:'Paid offering must have a positive amount.'})
  const end=row.end_date||row.tryout_date||row.end_time
  if(published&&end&&Date.parse(end)<Date.now())issues.push({code:'expired_unarchived',severity:'error',message:'Dated offering has expired but remains published.'})
  return issues
}

export async function GET(request:Request){
  const auth=await requireSuperadminApi(request);if(auth.error)return auth.error
  const orgId=parseUuid(new URL(request.url).searchParams.get('organization_id'))
  const orgFilter=(query:any,column='org_id')=>orgId?query.eq(column,orgId):query
  const results=await Promise.all([
    orgFilter(supabaseAdmin.from('org_fees').select('*')).limit(500),
    orgFilter(supabaseAdmin.from('programs').select('*')).limit(500),
    orgFilter(supabaseAdmin.from('org_tryouts').select('*')).limit(500),
    orgFilter(supabaseAdmin.from('org_training_packages').select('*')).limit(500),
    orgFilter(supabaseAdmin.from('sessions').select('*')).limit(500),
    orgFilter(supabaseAdmin.from('marketplace_items').select('*')).limit(500),
    orgFilter(supabaseAdmin.from('organization_recurring_fee_offers').select('*'),'organization_id').limit(500),
    orgFilter(supabaseAdmin.from('checkout_purchase_attempts').select('*'),'organization_id').in('status',['pending','checkout_pending','processing']).limit(500),
  ])
  if(results.some(result=>result.error))return NextResponse.json({error:'Offering integrity data is temporarily unavailable.'},{status:503})
  const types=['organization_fee','program','tryout','training_package','session','marketplace_product','recurring_offering']
  const items=types.flatMap((type,index)=>(results[index].data||[]).map((row:any)=>({offering_type:type,offering_id:row.id,organization_id:row.org_id||row.organization_id||null,title:row.title||row.name||row.description||null,issues:inspect(type,row)})))
  const duplicateKeys=new Map<string,number>()
  for(const item of items){const key=`${item.organization_id}:${item.offering_type}:${String(item.title||'').trim().toLowerCase()}`;duplicateKeys.set(key,(duplicateKeys.get(key)||0)+1)}
  for(const item of items){const key=`${item.organization_id}:${item.offering_type}:${String(item.title||'').trim().toLowerCase()}`;if(item.title&&(duplicateKeys.get(key)||0)>1)item.issues.push({code:'possible_duplicate',severity:'warning',message:'Another offering of this type uses the same title.'})}
  const staleAttempts=(results[7].data||[]).filter((row:any)=>!row.stripe_checkout_session_id||!row.expires_at||Date.parse(row.expires_at)<=Date.now()).map((row:any)=>({
    checkout_attempt_id:row.id,purchase_id:row.purchase_id,offering_type:row.checkout_type,offering_id:row.offering_id||row.purchase_id,
    organization_id:row.organization_id,issue:{code:'pending_without_resumable_checkout',severity:'error',message:'Pending payment has no resumable Checkout Session.'}}))
  const flagged=items.filter(item=>item.issues.length)
  return NextResponse.json({generated_at:today(),organization_id:orgId,summary:{offerings_checked:items.length,flagged_offerings:flagged.length,stale_pending_payments:staleAttempts.length},items:flagged,pending_payment_issues:staleAttempts})
}
