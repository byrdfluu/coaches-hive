import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { enrichWithWorkspace, resolveWorkspaceIdsForAdminSearch } from '@/lib/workspaceAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic='force-dynamic'
export async function GET(request:Request){
  const {session,error}=await getSessionRole(['admin','superadmin']);if(error||!session)return error??jsonError('Unauthorized',401)
  const p=new URL(request.url).searchParams,limit=Math.min(Math.max(Number(p.get('limit')||200),1),500),action=p.get('action'),actions=(p.get('actions')||'').split(',').map(v=>v.trim()).filter(Boolean),workspaceId=p.get('workspace_id')||'',search=(p.get('query')||'').trim(),resolved=search?await resolveWorkspaceIdsForAdminSearch(search):null
  let adminQuery=supabaseAdmin.from('admin_audit_log').select('id,workspace_id,actor_id,actor_email,action,target_type,target_id,metadata,created_at').order('created_at',{ascending:false}).limit(limit)
  let workspaceQuery=supabaseAdmin.from('workspace_audit_events').select('id,workspace_id,actor_user_id,acting_role,event_type,record_type,record_id,metadata,occurred_at').order('occurred_at',{ascending:false}).limit(limit)
  if(actions.length){adminQuery=adminQuery.in('action',actions);workspaceQuery=workspaceQuery.in('event_type',actions)}else if(action){adminQuery=adminQuery.eq('action',action);workspaceQuery=workspaceQuery.eq('event_type',action)}
  if(workspaceId){adminQuery=adminQuery.eq('workspace_id',workspaceId);workspaceQuery=workspaceQuery.eq('workspace_id',workspaceId)}else if(resolved?.size){const ids=Array.from(resolved);adminQuery=adminQuery.in('workspace_id',ids);workspaceQuery=workspaceQuery.in('workspace_id',ids)}
  const [admin,workspace]=await Promise.all([adminQuery,workspaceQuery]);if(admin.error||workspace.error)return jsonError('Unable to load audit events',500)
  const raw=[...(admin.data||[]),...(workspace.data||[]).map((row:any)=>({id:row.id,workspace_id:row.workspace_id,actor_id:row.actor_user_id,actor_email:null,action:row.event_type,target_type:row.record_type,target_id:row.record_id,metadata:row.metadata,created_at:row.occurred_at,acting_role:row.acting_role}))].sort((a:any,b:any)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,limit)
  const enriched=await enrichWithWorkspace(raw),lower=search.toLowerCase(),logs=enriched.filter((row:any)=>!search||JSON.stringify(row).toLowerCase().includes(lower)||resolved?.has(row.workspace_id))
  return NextResponse.json({logs,items:logs,total_count:logs.length})
}
