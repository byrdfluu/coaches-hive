import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { filterAdminTestRows, shouldShowTestData } from '@/lib/adminTestData'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const params = new URL(request.url).searchParams
  const query = (params.get('query') || '').toLowerCase()
  const table = params.get('status') || ''
  const showTestData = shouldShowTestData(params)
  let db = supabaseAdmin.from('workspace_admin_reconciliation_queue')
    .select('table_name,id,created_at').order('created_at', { ascending: false }).limit(500)
  if (table) db = db.eq('table_name', table)
  const [{ data, error }, { data: workspaces }] = await Promise.all([
    db,
    supabaseAdmin.from('business_workspaces').select('id,display_name,workspace_type,status,is_test')
      .neq('status', 'archived').order('display_name'),
  ])
  if (error) return NextResponse.json({ error: 'Unable to load workspace reconciliation queue.' }, { status: 500 })
  const searchableItems = (data || []).filter((item) => !query || JSON.stringify(item).toLowerCase().includes(query))
  const items = await filterAdminTestRows(searchableItems.map((item:any) => ({ ...item,
    user_id: item.table_name === 'profiles' ? item.id : null,
    athlete_id: item.table_name === 'athlete_profiles' ? item.id : null,
    organization_id: item.table_name === 'organizations' ? item.id : null,
    workspace_id: item.table_name === 'business_workspaces' ? item.id : null,
  })), showTestData)
  return NextResponse.json({ items, workspaces: showTestData ? workspaces || [] : (workspaces || []).filter((workspace:any)=>!workspace.is_test), summary: { unresolved: items.length } })
}
