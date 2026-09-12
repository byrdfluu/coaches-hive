import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const LEAGUE_ROLES = ['league_admin','division_admin','finance_manager','registrar','compliance_manager','read_only_auditor'] as const
export async function requireLeagueMembership(userId:string,leagueId?:string|null){
  let query=supabaseAdmin.from('league_memberships').select('id,league_id,role,status').eq('user_id',userId).eq('status','active')
  if(leagueId)query=query.eq('league_id',leagueId)
  const{data,error}=await query.order('created_at',{ascending:true}).limit(1).maybeSingle()
  if(error||!data)return null
  const{data:grants}=await supabaseAdmin.from('league_permissions').select('scope_type,scope_id,permissions').eq('membership_id',data.id)
  return{...data,permissions:grants||[]}
}
export const leagueCan=(authority:Awaited<ReturnType<typeof requireLeagueMembership>>,permission:string)=>Boolean(authority&&(authority.role==='league_admin'||authority.permissions.some((grant:any)=>grant.permissions?.[permission]===true)))
