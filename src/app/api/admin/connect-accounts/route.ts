import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { enrichWithWorkspace, resolveWorkspaceIdsForAdminSearch } from '@/lib/workspaceAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const auth=await requireSuperadminApi(); if(auth.error)return auth.error
  const p=new URL(request.url).searchParams,q=(p.get('query')||'').trim(),status=p.get('status')||'',workspaceId=p.get('workspace_id')||'',resolved=q?await resolveWorkspaceIdsForAdminSearch(q):null
  let db=supabaseAdmin.from('stripe_connect_accounts').select('*').order('updated_at',{ascending:false}).limit(250)
  if(status)db=db.eq('connect_status',status);if(workspaceId)db=db.eq('workspace_id',workspaceId);else if(resolved?.size)db=db.in('workspace_id',Array.from(resolved))
  const {data,error}=await db;if(error)return NextResponse.json({error:'Unable to load Connect accounts.'},{status:500})
  const enriched=await enrichWithWorkspace(data||[]),lower=q.toLowerCase()
  const items=enriched.filter((r:any)=>!q||JSON.stringify(r).toLowerCase().includes(lower)||resolved?.has(r.workspace_id)).map((r:any)=>({...r,connect_ready:Boolean(r.charges_enabled&&r.payouts_enabled),requirements_due:(r.requirements_due||[]).join(', ')}))
  return NextResponse.json({items,summary:{accounts:items.length,enabled:items.filter((r:any)=>r.connect_ready).length,restricted:items.filter((r:any)=>!r.connect_ready).length,action_required:items.filter((r:any)=>(r.requirements_due||'').length>0).length}})
}
