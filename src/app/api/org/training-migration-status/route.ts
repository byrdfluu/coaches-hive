import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { resolveActiveOrganization } from '@/lib/activeOrganization'

export const dynamic = 'force-dynamic'
const allowed = new Set(['owner', 'org_admin', 'admin', 'program_director', 'school_admin', 'athletic_director', 'club_admin', 'travel_admin'])

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const org = await resolveActiveOrganization(session.user.id, { requestedWorkspaceId: request.headers.get('x-workspace-id') })
  if (!org || !allowed.has(org.role)) return NextResponse.json({ error: 'Organization leadership access is required.' }, { status: 403 })
  const [inventory, reconciliation] = await Promise.all([
    (supabase as any).from('legacy_training_migration_inventory').select('*').eq('org_id', org.organizationId),
    (supabase as any).from('legacy_training_credit_reconciliation').select('*').eq('org_id', org.organizationId),
  ])
  if (inventory.error || reconciliation.error) return NextResponse.json({ error: 'Migration status is temporarily unavailable.' }, { status: 503 })
  const exceptions = (reconciliation.data || []).filter((row: any) => row.reconciliation_status !== 'reconciled_legacy_authoritative')
  return NextResponse.json({ organization_id: org.organizationId, read_only: true, inventory: inventory.data || [], reconciliation: reconciliation.data || [], exceptions }, { headers: { 'Cache-Control': 'private, no-store' } })
}
