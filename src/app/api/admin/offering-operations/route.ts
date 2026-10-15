import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { requestIdFor } from '@/lib/requestSecurity'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestId = requestIdFor(request)
  const auth = await requireSuperadminApi(request)
  if (auth.error) return auth.error
  const supabase = await createRouteHandlerClientCompat()
  const { data, error } = await (supabase as any).rpc('admin_offering_operations_snapshot')
  if (error) {
    console.error('[admin/offering-operations] failed', { request_id: requestId, code: error.code })
    return NextResponse.json({ error: 'Offering lifecycle metrics are temporarily unavailable.', request_id: requestId }, { status: 503 })
  }
  return NextResponse.json({ snapshot: data || {}, request_id: requestId }, { headers: { 'Cache-Control': 'private, no-store' } })
}
