import type {SupabaseClient} from '@supabase/supabase-js'
import {asSharedSupabaseClient} from '@/lib/sharedSupabaseContract'

export const ORGANIZATION_STAFF_ROLES=['owner','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager','coach','assistant_coach'] as const
const rolePriority=['owner','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager','coach','assistant_coach']
const normalize=(value:unknown)=>String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_')

export type ActiveOrganizationStaffContext={workspaceId:string;organizationId:string;actingRole:string;roles:string[];nextPath:'/org'|'/coach/dashboard'}

export async function resolveActiveOrganizationStaffContext(client:SupabaseClient,preferredOrganizationId?:string|null,requiredWorkspaceId?:string|null):Promise<ActiveOrganizationStaffContext|null>{
 const supabase=asSharedSupabaseClient(client),{data,error}=await supabase.rpc('available_workspaces')
 if(error)return null
 const candidates=(data||[]).filter(workspace=>workspace.workspace_type==='organization'&&workspace.organization_id&&Array.isArray(workspace.roles)&&workspace.roles.some(role=>ORGANIZATION_STAFF_ROLES.includes(normalize(role) as typeof ORGANIZATION_STAFF_ROLES[number])))
 const workspace=requiredWorkspaceId
  ? candidates.find(item=>item.workspace_id===requiredWorkspaceId)
  : candidates.find(item=>preferredOrganizationId&&item.organization_id===preferredOrganizationId)||candidates.find(item=>item.is_last_used)||candidates[0]
 if(!workspace)return null
 const roles=Array.from(new Set((workspace.roles||[]).map(normalize).filter(role=>ORGANIZATION_STAFF_ROLES.includes(role as typeof ORGANIZATION_STAFF_ROLES[number]))))
 const actingRole=rolePriority.find(role=>roles.includes(role))
 if(!actingRole)return null
 const administrative=!['coach','assistant_coach'].includes(actingRole)
 return{workspaceId:workspace.workspace_id,organizationId:String(workspace.organization_id),actingRole,roles,nextPath:administrative?'/org':'/coach/dashboard'}
}
