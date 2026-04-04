import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['admin', 'superadmin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const { searchParams } = new URL(request.url)
  const limitParam = Number(searchParams.get('limit') || 300)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 300

  const { data, error: fetchError } = await supabaseAdmin
    .from('org_audit_log')
    .select('id, org_id, actor_id, actor_email, action, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (fetchError) return jsonError(fetchError.message, 500)

  const orgIds = Array.from(new Set((data || []).map((row) => row.org_id).filter(Boolean)))
  let orgMap = new Map<string, string>()
  if (orgIds.length > 0) {
    const { data: orgRows } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .in('id', orgIds)
    orgMap = new Map((orgRows || []).map((row) => [row.id, row.name || row.id]))
  }

  const logs = (data || []).map((row) => ({
    ...row,
    org_name: row.org_id ? orgMap.get(row.org_id) || row.org_id : undefined,
  }))

  return NextResponse.json({ logs })
}
