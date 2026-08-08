import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireSuperadminApi()
  if (auth.error) return auth.error
  const params = new URL(request.url).searchParams
  const query = (params.get('query') || '').toLowerCase()
  const table = params.get('status') || ''
  let db = supabaseAdmin.from('workspace_admin_reconciliation_queue')
    .select('table_name,id,created_at').order('created_at', { ascending: false }).limit(500)
  if (table) db = db.eq('table_name', table)
  const [{ data, error }, { data: workspaces }] = await Promise.all([
    db,
    supabaseAdmin.from('business_workspaces').select('id,display_name,workspace_type,status')
      .neq('status', 'archived').order('display_name'),
  ])
  if (error) return NextResponse.json({ error: 'Unable to load workspace reconciliation queue.' }, { status: 500 })
  const items = (data || []).filter((item) => !query || JSON.stringify(item).toLowerCase().includes(query))
  return NextResponse.json({ items, workspaces: workspaces || [], summary: { unresolved: items.length } })
}
