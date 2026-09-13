import type { SupabaseClient } from '@supabase/supabase-js'
import { asSharedSupabaseClient } from '@/lib/sharedSupabaseContract'

export async function getActiveOrganizationId(supabase: SupabaseClient): Promise<string | null> {
  const [{ data: userData }, workspaceResult] = await Promise.all([
    supabase.auth.getUser(),
    asSharedSupabaseClient(supabase).rpc('available_workspaces'),
  ])
  if (workspaceResult.error) throw workspaceResult.error
  const workspaces = workspaceResult.data || []
  const currentOrgId = String(userData.user?.user_metadata?.current_org_id || '')
  const selected = workspaces.find(workspace => workspace.workspace_type === 'organization' && workspace.is_last_used)
    || workspaces.find(workspace => workspace.organization_id === currentOrgId)
    || workspaces.find(workspace => workspace.workspace_type === 'organization')
  return selected?.organization_id || null
}
