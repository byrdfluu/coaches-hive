import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { activeWorkspaceRole, normalizeWorkspaceRole, requireWorkspaceContext, workspaceCan, type WorkspaceContext } from '@/lib/workspaceAuthority'

export type PortalKind = 'organization'|'coach'|'parent'|'league'
export type CapabilityGrant = { view:boolean; manage:boolean; pay:boolean; waive:boolean; refund:boolean }
export type PortalCapabilityDocument = { schema_version:string; portal:PortalKind; workspace_id:string|null; organization_id:string|null; role:string; capabilities:Record<string,CapabilityGrant> }
const grant=(view=true,manage=false,pay=false,waive=false,refund=false):CapabilityGrant=>({view,manage,pay,waive,refund})

const ORG_ADMIN_ROLES = new Set(['owner','org_admin','club_admin','travel_admin','school_admin','athletic_director'])
const PROGRAM_DIRECTOR_DEFAULTS = new Set(['manage_members','manage_teams','manage_schedule','manage_documents','manage_coaches','send_messages','manage_waivers','manage_registrations','manage_seasons','view_reports','manage_reports'])
const can = (workspace: WorkspaceContext, permission: string, fallbackRoles: string[] = []) =>
  workspaceCan(workspace, permission) || workspace.roles.some(role => fallbackRoles.includes(role))

export async function resolvePortalCapabilities(userId:string,requestedWorkspaceId?:string|null,requestedOrgId?:string|null,requestedRole?:string|null):Promise<PortalCapabilityDocument|null>{
  const workspace=await requireWorkspaceContext(userId,requestedWorkspaceId||undefined)
  if(requestedWorkspaceId&&!workspace)return null
  if(workspace?.type==='organization'&&workspace.organizationId){
    if(requestedOrgId && requestedOrgId !== workspace.organizationId) return null
    const activeRole=activeWorkspaceRole(workspace,requestedRole)||normalizeWorkspaceRole(workspace.roles[0])||'member'
    if(['coach','assistant_coach'].includes(activeRole))return organizationCoachDocument(workspace,activeRole)
    return organizationDocument(workspace,activeRole)
  }
  if(workspace?.type==='league')return leagueDocument(workspace.id,workspace.roles[0]||'read_only_auditor',workspace)
  if(workspace?.type==='independent_coach')return coachDocument(workspace.id,workspace.roles[0]||'owner')
  const{data:profile}=await supabaseAdmin.from('profiles').select('role').eq('id',userId).maybeSingle();const role=String(profile?.role||'athlete')
  return role==='coach'?coachDocument(workspace?.id||null,role):parentDocument(workspace?.id||null,role)
}

const common={notifications:grant(),messages:grant(),calendar:grant(),settings:grant(),support:grant(),profile:grant()}

const organizationDocument=(workspace:WorkspaceContext,role:string):PortalCapabilityDocument=>{
  const administrator=ORG_ADMIN_ROLES.has(role)
  const programDirector=role==='program_director'
  const permission=(key:string,fallback:string[]=[])=>administrator||(programDirector&&PROGRAM_DIRECTOR_DEFAULTS.has(key))||can(workspace,key,fallback)
  const members=permission('manage_members')
  const teams=permission('manage_teams',['team_manager'])
  const schedule=permission('manage_schedule',['team_manager'])
  const documents=permission('manage_documents')
  const payments=permission('manage_payments')
  const reports=permission('view_reports')||permission('manage_reports')
  return{schema_version:'2026-10-08',portal:'organization',workspace_id:workspace.id,organization_id:workspace.organizationId,role,capabilities:{
    ...common,dashboard:grant(),messages:grant(true,permission('send_messages')),
    teams:grant(true,teams),coaches:grant(true,permission('manage_coaches')),
    contacts:grant(permission('view_members')||members,members),permissions:grant(permission('manage_permissions'),permission('manage_permissions')),
    notes:grant(true,members),waivers:grant(true,permission('manage_waivers')||documents),tryouts:grant(true,permission('manage_registrations')),
    registrations:grant(true,permission('manage_registrations')),games:grant(true,schedule),seasons:grant(true,permission('manage_seasons')||teams),
    marketplace:grant(true,permission('manage_marketplace'),false,false,permission('manage_marketplace')),
    payments:grant(payments,payments,false,payments,payments),dues:grant(payments,payments,false,payments,payments),
    events:grant(true,schedule),facilities:grant(true,schedule,true,false,schedule),fundraising:grant(true,payments),
    billing:grant(permission('manage_billing')||payments,permission('manage_billing')||payments),reports:grant(reports),audit:grant(permission('view_audit')||reports),
    compliance:grant(true,documents),tasks:grant(true,administrator),notification_preferences:grant(true,permission('manage_settings')),stripe_connect:grant(payments,payments),
  }}
}

const organizationCoachDocument=(workspace:WorkspaceContext,role:string):PortalCapabilityDocument=>{
  const permission=(key:string,defaultValue=false)=>workspace.permissions[key]===true||defaultValue
  const assignedAthletes=permission('view_assigned_athletes',true)
  const assignedSchedule=permission('manage_assigned_schedule',true)
  const documents=permission('view_org_documents',true)
  return{schema_version:'2026-10-08',portal:'coach',workspace_id:workspace.id,organization_id:workspace.organizationId,role,capabilities:{
    ...common,dashboard:grant(),messages:grant(true,permission('message_assigned_members',true)),
    athletes:grant(assignedAthletes,permission('request_athlete_access')),attendance:grant(assignedAthletes,permission('record_attendance',true)),
    training_plans:grant(assignedAthletes,permission('manage_training_plans')),bookings:grant(false),availability:grant(true,assignedSchedule),calendar:grant(true,assignedSchedule),
    notes:grant(assignedAthletes,permission('manage_athlete_notes')),notification_preferences:grant(true,true),marketplace:grant(false),programs:grant(false),memberships:grant(false),
    payments:grant(permission('view_org_finance')),waivers:grant(documents,permission('upload_requested_documents',true)),documents:grant(documents,permission('upload_requested_documents',true)),
    reviews:grant(),reports:grant(permission('view_org_reports')),tasks:grant(true,false),retention:grant(false),organizations_teams:grant(permission('view_assigned_teams',true)),facilities:grant(false),stripe_connect:grant(false),
  }}
}

const coachDocument=(workspaceId:string|null,role:string):PortalCapabilityDocument=>({schema_version:'2026-10-08',portal:'coach',workspace_id:workspaceId,organization_id:null,role,capabilities:{...common,dashboard:grant(),athletes:grant(true,true),attendance:grant(true,true),training_plans:grant(true,true),bookings:grant(true,true),availability:grant(true,true),notes:grant(true,true),notification_preferences:grant(true,true),marketplace:grant(true,true,false,false,true),programs:grant(true,true),memberships:grant(true,true),payments:grant(),waivers:grant(true,true),documents:grant(true,true),reviews:grant(),reports:grant(),retention:grant(),organizations_teams:grant(),facilities:grant(true,true,true,false,true),stripe_connect:grant(true,true)}})
const parentDocument=(workspaceId:string|null,role:string):PortalCapabilityDocument=>({schema_version:'2026-10-08',portal:'parent',workspace_id:workspaceId,organization_id:null,role,capabilities:{...common,dashboard:grant(),family_workspace:grant(),discover:grant(),coaches:grant(),training_plans:grant(true,true),notification_preferences:grant(true,true),notes:grant(true,true),marketplace:grant(true,false,true,false,true),programs:grant(true,false,true),memberships:grant(true,false,true),payments:grant(true,false,true,false,true),dues:grant(true,false,true),events:grant(true,false,true),registrations:grant(true,false,true),facilities:grant(true,false,true,false,true),fundraising:grant(true,false,true),organizations_teams:grant(),waivers:grant(true,true)}})
const leagueDocument=(workspaceId:string,role:string,workspace:WorkspaceContext):PortalCapabilityDocument=>{const permission=(key:string)=>workspaceCan(workspace,key);return{schema_version:'2026-10-08',portal:'league',workspace_id:workspaceId,organization_id:null,role,capabilities:{...common,dashboard:grant(),clubs:grant(true,permission('manage_organizations')),divisions:grant(true,permission('manage_divisions')),teams:grant(true,permission('manage_teams')),calendar:grant(true,permission('manage_schedule')),registrations:grant(true,permission('manage_registrations')),payments:grant(true,permission('manage_payments')),documents:grant(true,permission('manage_documents')),compliance:grant(true,permission('manage_documents')),announcements:grant(true,permission('send_announcements')),permissions:grant(true,permission('manage_members')),seasons:grant(true,permission('manage_seasons')),operations_settings:grant(true,permission('manage_registrations')),audit:grant(permission('view_audit')),reports:grant(permission('view_reports'))}}}
