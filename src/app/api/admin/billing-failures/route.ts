import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { enrichWithWorkspace, resolveWorkspaceIdsForAdminSearch } from '@/lib/workspaceAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic='force-dynamic'
export async function GET(request:Request){
  const auth=await requireSuperadminApi();if(auth.error)return auth.error
  const p=new URL(request.url).searchParams,q=(p.get('query')||'').trim(),workspaceId=p.get('workspace_id')||'',resolved=q?await resolveWorkspaceIdsForAdminSearch(q):null
  let subsQuery=supabaseAdmin.from('platform_subscriptions').select('user_id,workspace_id,owner_type,tier,status,purchase_channel,current_period_end,updated_at,stripe_customer_id,stripe_subscription_id').in('status',['past_due','unpaid','incomplete','incomplete_expired']).limit(150)
  let handoffQuery=supabaseAdmin.from('mobile_checkout_handoffs').select('nonce,user_id,workspace_id,checkout_type,resource_id,status,last_error,expires_at,updated_at,stripe_checkout_session_id').in('status',['issued','processing','expired']).limit(150)
  let eventQuery=supabaseAdmin.from('stripe_webhook_events').select('event_id,workspace_id,event_type,status,last_error,received_at,processed_at').in('status',['failed','processing']).limit(150)
  if(workspaceId){subsQuery=subsQuery.eq('workspace_id',workspaceId);handoffQuery=handoffQuery.eq('workspace_id',workspaceId);eventQuery=eventQuery.eq('workspace_id',workspaceId)}else if(resolved?.size){const ids=Array.from(resolved);subsQuery=subsQuery.in('workspace_id',ids);handoffQuery=handoffQuery.in('workspace_id',ids);eventQuery=eventQuery.in('workspace_id',ids)}
  let healthQuery=supabaseAdmin.from('payment_operations_health').select('*').limit(250)
  if(workspaceId)healthQuery=healthQuery.eq('workspace_id',workspaceId)
  const [subs,handoffs,events,health]=await Promise.all([subsQuery,handoffQuery,eventQuery,healthQuery])
  const raw=[...(subs.data||[]).map((r:any)=>({...r,id:r.user_id,source:'subscription',kind:r.tier,error:null,occurred_at:r.updated_at,reference:r.stripe_subscription_id||r.user_id})),...(handoffs.data||[]).map((r:any)=>({...r,id:r.nonce,source:'checkout',kind:r.checkout_type,error:r.last_error,occurred_at:r.updated_at,reference:r.stripe_checkout_session_id||r.resource_id})),...(events.data||[]).map((r:any)=>({...r,id:r.event_id,source:'stripe_webhook',kind:r.event_type,error:r.last_error,occurred_at:r.received_at,reference:r.event_id})),...(health.data||[]).map((r:any)=>({...r,id:`health:${r.issue_id}`,source:'payment_health',kind:r.issue_type,error:r.last_error,occurred_at:r.updated_at,reference:r.stripe_checkout_session_id||r.resource_id||r.issue_id}))]
  const enriched=await enrichWithWorkspace(raw),lower=q.toLowerCase(),items=enriched.filter((r:any)=>!q||JSON.stringify(r).toLowerCase().includes(lower)||resolved?.has(r.workspace_id))
  return NextResponse.json({items,summary:{failures:items.length,subscriptions:items.filter(r=>r.source==='subscription').length,checkouts:items.filter(r=>r.source==='checkout').length,webhooks:items.filter(r=>r.source==='stripe_webhook').length,payment_health:items.filter(r=>r.source==='payment_health').length}})
}
