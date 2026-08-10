import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const shouldShowTestData = (params: URLSearchParams) => params.get('show_test_data') === 'true'

type AdminTestScope = {
  userIds: Set<string>
  athleteIds: Set<string>
  organizationIds: Set<string>
  workspaceIds: Set<string>
}

export async function loadAdminTestScope(): Promise<AdminTestScope> {
  const [profiles, athletes, organizations, workspaces] = await Promise.all([
    supabaseAdmin.from('profiles').select('id').eq('is_test', true),
    supabaseAdmin.from('athlete_profiles').select('id,owner_user_id').eq('is_test', true),
    supabaseAdmin.from('organizations').select('id').eq('is_test', true),
    supabaseAdmin.from('business_workspaces').select('id').eq('is_test', true),
  ])
  return {
    userIds: new Set([...(profiles.data || []).map(row => row.id), ...(athletes.data || []).map(row => row.owner_user_id).filter(Boolean)]),
    athleteIds: new Set((athletes.data || []).map(row => row.id)),
    organizationIds: new Set((organizations.data || []).map(row => row.id)),
    workspaceIds: new Set((workspaces.data || []).map(row => row.id)),
  }
}

const values = (row: any, keys: string[]) => keys.map(key => row?.[key]).filter(Boolean)

export async function filterAdminTestRows<T extends Record<string, any>>(rows: T[], showTestData: boolean) {
  const scope = await loadAdminTestScope()
  const classified = rows.map(row => {
    const isTest = Boolean(row.is_test || row.workspace_is_test)
      || values(row, ['user_id','requester_id','owner_user_id','payer_id','payee_id','coach_id']).some(id => scope.userIds.has(id))
      || values(row, ['athlete_id']).some(id => scope.athleteIds.has(id))
      || values(row, ['organization_id','org_id']).some(id => scope.organizationIds.has(id))
      || values(row, ['workspace_id']).some(id => scope.workspaceIds.has(id))
    return { ...row, is_test: isTest }
  })
  return showTestData ? classified : classified.filter(row => !row.is_test)
}

