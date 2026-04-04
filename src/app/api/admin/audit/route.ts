import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function GET(request: Request) {
  const { session, error } = await getSessionRole(['admin', 'superadmin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const { searchParams } = new URL(request.url)
  const limitParam = Number(searchParams.get('limit') || 200)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 200
  const action = searchParams.get('action')
  const actionsParam = searchParams.get('actions')
  const actions = actionsParam
    ? actionsParam
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : []

  let query = supabaseAdmin
    .from('admin_audit_log')
    .select('id, actor_id, actor_email, action, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  let countQuery = supabaseAdmin
    .from('admin_audit_log')
    .select('id', { head: true, count: 'exact' })

  if (actions.length) {
    query = query.in('action', actions)
    countQuery = countQuery.in('action', actions)
  } else if (action) {
    query = query.eq('action', action)
    countQuery = countQuery.eq('action', action)
  }

  const { data, error: fetchError } = await query
  const { count } = await countQuery

  if (fetchError) {
    return jsonError(fetchError.message, 500)
  }

  return NextResponse.json({ logs: data || [], total_count: count || 0 })
}
