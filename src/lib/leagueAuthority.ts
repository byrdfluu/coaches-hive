import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireWorkspaceContext } from '@/lib/workspaceAuthority'

export const LEAGUE_ROLES = ['league_admin','division_admin','finance_manager','registrar','compliance_manager','read_only_auditor'] as const
export async function requireLeagueMembership(userId:string,workspaceId?:string|null){
  const workspace=await requireWorkspaceContext(userId,workspaceId)
  if(!workspace||workspace.type!=='league'||!workspace.leagueId)return null
  const{data,error}=await supabaseAdmin.from('league_memberships').select('id,league_id,role,status')
    .eq('user_id',userId).eq('league_id',workspace.leagueId).eq('status','active').maybeSingle()
  if(error||!data)return null
  const{data:grants}=await supabaseAdmin.from('league_permissions').select('scope_type,scope_id,permissions').eq('membership_id',data.id)
  return{...data,workspace_id:workspace.id,workspace_roles:workspace.roles,workspace_permissions:workspace.permissions,permissions:grants||[]}
}
export const leagueCan=(authority:Awaited<ReturnType<typeof requireLeagueMembership>>,permission:string)=>Boolean(authority&&(authority.role==='league_admin'||authority.workspace_roles.includes('league_admin')||authority.workspace_permissions[permission]===true||authority.permissions.some((grant:any)=>grant.permissions?.[permission]===true)))
