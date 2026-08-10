import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { enrichWithWorkspace, resolveWorkspaceIdsForAdminSearch } from '@/lib/workspaceAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { filterAdminTestRows, shouldShowTestData } from '@/lib/adminTestData'
export const dynamic='force-dynamic'
export async function GET(request:Request){
  const auth=await requireSuperadminApi();if(auth.error)return auth.error
  const p=new URL(request.url).searchParams,q=(p.get('query')||'').trim(),status=p.get('status')||'',workspaceId=p.get('workspace_id')||'',resolved=q?await resolveWorkspaceIdsForAdminSearch(q):null
  let stripeQuery=supabaseAdmin.from('stripe_webhook_events').select('*').order('received_at',{ascending:false}).limit(200)
  let appleQuery=supabaseAdmin.from('app_store_server_notifications').select('*').order('created_at',{ascending:false}).limit(200)
  if(workspaceId){stripeQuery=stripeQuery.eq('workspace_id',workspaceId);appleQuery=appleQuery.eq('workspace_id',workspaceId)}else if(resolved?.size){const ids=Array.from(resolved);stripeQuery=stripeQuery.in('workspace_id',ids);appleQuery=appleQuery.in('workspace_id',ids)}
  const [stripe,apple]=await Promise.all([stripeQuery,appleQuery])
  const raw=[...(stripe.data||[]).map((r:any)=>({id:r.event_id,workspace_id:r.workspace_id,source:'Stripe',type:r.event_type,status:r.status,error:r.last_error,received_at:r.received_at,processed_at:r.processed_at})),...(apple.data||[]).map((r:any)=>({id:r.notification_uuid,workspace_id:r.workspace_id,source:'Apple',type:[r.notification_type,r.subtype].filter(Boolean).join(' / '),status:r.status,error:r.last_error,received_at:r.created_at,processed_at:r.processed_at}))]
  const enriched=await enrichWithWorkspace(raw),lower=q.toLowerCase()
  const matched=enriched.filter((r:any)=>(!status||r.status===status)&&(!q||JSON.stringify(r).toLowerCase().includes(lower)||resolved?.has(r.workspace_id))),items=await filterAdminTestRows(matched,shouldShowTestData(p))
  return NextResponse.json({items,summary:{events:items.length,failed:items.filter(r=>r.status==='failed').length,processing:items.filter(r=>r.status==='processing').length,stripe:items.filter(r=>r.source==='Stripe').length}})
}
