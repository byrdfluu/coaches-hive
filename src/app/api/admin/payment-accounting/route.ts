import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { enrichWithWorkspace, resolveWorkspaceIdsForAdminSearch } from '@/lib/workspaceAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { filterAdminTestRows, shouldShowTestData } from '@/lib/adminTestData'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const auth=await requireSuperadminApi();if(auth.error)return auth.error
  const p=new URL(request.url).searchParams,query=(p.get('query')||'').trim(),status=p.get('status')||'',workspaceId=p.get('workspace_id')||'',resolved=query?await resolveWorkspaceIdsForAdminSearch(query):null
  let db=supabaseAdmin.from('stripe_connect_payment_accounting').select('*').order('created_at',{ascending:false}).limit(250)
  if(status)db=db.eq('checkout_type',status);if(workspaceId)db=db.eq('workspace_id',workspaceId);else if(resolved?.size)db=db.in('workspace_id',Array.from(resolved))
  const {data,error}=await db
  if(error)return NextResponse.json({error:error.code==='42P01'?'Deploy the payment accounting migration first.':'Unable to load payment accounting.'},{status:500})
  const enriched=await enrichWithWorkspace(data||[]),lower=query.toLowerCase(),matched=enriched.filter((r:any)=>!query||JSON.stringify(r).toLowerCase().includes(lower)||resolved?.has(r.workspace_id)),items=await filterAdminTestRows(matched,shouldShowTestData(p))
  return NextResponse.json({items,summary:{payments:items.length,gross_cents:items.reduce((n:number,r:any)=>n+Number(r.gross_amount_cents||0),0),platform_fee_cents:items.reduce((n:number,r:any)=>n+Number(r.platform_fee_cents||0),0),net_cents:items.reduce((n:number,r:any)=>n+Number(r.net_amount_cents||0),0)}})
}
