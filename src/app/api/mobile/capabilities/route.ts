import{NextResponse}from'next/server'
import{requireMobileUser}from'@/lib/mobilePaymentApi'
import{resolvePortalCapabilities}from'@/lib/portalCapabilities'
import{activeWorkspaceRole,normalizeWorkspaceRole,requireWorkspaceContext}from'@/lib/workspaceAuthority'
import{supabaseAdmin}from'@/lib/supabaseAdmin'
import{correlatedError,requestIdFor}from'@/lib/requestSecurity'
import{normalizeUuid}from'@/lib/uuid'

export const dynamic='force-dynamic'

export async function GET(request:Request){
 const requestId=requestIdFor(request),auth=await requireMobileUser(request);if('response'in auth)return auth.response
 const url=new URL(request.url),headerWorkspaceId=normalizeUuid(request.headers.get('x-workspace-id')),queryWorkspaceId=normalizeUuid(url.searchParams.get('workspace_id'))
 const requestedOrgId=normalizeUuid(url.searchParams.get('organization_id')||url.searchParams.get('org_id'))
 const requestedRole=request.headers.get('x-acting-role')||url.searchParams.get('acting_role')
 if(headerWorkspaceId&&queryWorkspaceId&&headerWorkspaceId!==queryWorkspaceId)return correlatedError(requestId,'workspace_context_mismatch','The workspace header and query parameter must match.',409,false)
 let workspaceId=headerWorkspaceId||queryWorkspaceId
 if(!workspaceId&&requestedOrgId){const{data}=await supabaseAdmin.from('business_workspaces').select('id').eq('workspace_type','organization').eq('organization_id',requestedOrgId).eq('status','active').maybeSingle();workspaceId=data?.id||null}
 if(!workspaceId)return correlatedError(requestId,'workspace_header_required','Select an active workspace and try again.',400,false)
 let workspace=await requireWorkspaceContext(auth.user.id,workspaceId)
 if(!workspace&&requestedOrgId&&workspaceId===requestedOrgId){const{data}=await supabaseAdmin.from('business_workspaces').select('id').eq('workspace_type','organization').eq('organization_id',requestedOrgId).eq('status','active').maybeSingle();if(data?.id){workspaceId=data.id;workspace=await requireWorkspaceContext(auth.user.id,workspaceId)}}
 if(!workspace)return correlatedError(requestId,'workspace_forbidden','You do not have access to the selected workspace.',403,false)
 if(requestedOrgId&&workspace.organizationId!==requestedOrgId)return correlatedError(requestId,'workspace_context_mismatch','The selected organization does not match the active workspace.',409,false)
 const normalizedRequestedRole=normalizeWorkspaceRole(requestedRole)
 if(normalizedRequestedRole&&!activeWorkspaceRole(workspace,normalizedRequestedRole))return correlatedError(requestId,'invalid_acting_role','The selected role is not active in this workspace.',403,false)
 const actingRole=normalizedRequestedRole||normalizeWorkspaceRole(workspace.roles[0])
 const document=await resolvePortalCapabilities(auth.user.id,workspaceId,workspace.organizationId,actingRole)
 if(!document)return correlatedError(requestId,'capability_resolution_failed','Portal capabilities could not be resolved for an authorized workspace.',503,true)
 return NextResponse.json(document,{headers:{'Cache-Control':'private, no-store, max-age=0','X-Coaches-Hive-Support-Reference':requestId}})
}
