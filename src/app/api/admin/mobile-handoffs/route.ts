import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { enrichWithWorkspace, resolveWorkspaceIdsForAdminSearch } from '@/lib/workspaceAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { filterAdminTestRows, shouldShowTestData } from '@/lib/adminTestData'
export const dynamic='force-dynamic'
export async function GET(request:Request){
  const auth=await requireSuperadminApi();if(auth.error)return auth.error
  const p=new URL(request.url).searchParams,q=(p.get('query')||'').trim(),status=p.get('status')||'',workspaceId=p.get('workspace_id')||''
  const resolved=q?await resolveWorkspaceIdsForAdminSearch(q):null
  let db=supabaseAdmin.from('mobile_checkout_handoffs').select('nonce,user_id,workspace_id,checkout_type,resource_id,status,stripe_checkout_session_id,expires_at,fulfilled_at,last_error,created_at,updated_at').order('created_at',{ascending:false}).limit(250)
  if(status)db=db.eq('status',status);if(workspaceId)db=db.eq('workspace_id',workspaceId);else if(resolved?.size)db=db.in('workspace_id',Array.from(resolved))
  const {data,error}=await db;if(error)return NextResponse.json({error:'Unable to load mobile handoffs.'},{status:500})
  const enriched=await enrichWithWorkspace((data||[]).map((r:any)=>({...r,id:r.nonce})))
  const lower=q.toLowerCase(),matched=enriched.filter((r:any)=>!q||JSON.stringify(r).toLowerCase().includes(lower)||resolved?.has(r.workspace_id)),items=await filterAdminTestRows(matched,shouldShowTestData(p))
  return NextResponse.json({items,summary:{handoffs:items.length,open:items.filter((r:any)=>['issued','processing'].includes(r.status)).length,fulfilled:items.filter((r:any)=>r.status==='fulfilled').length,failed:items.filter((r:any)=>r.last_error).length}})
}
