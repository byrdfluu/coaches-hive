import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PAGE_SIZE = 25
const VALID_STATUSES = new Set(['processing', 'processed', 'ignored', 'failed'])

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return jsonError('Unauthorized', 401)

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .maybeSingle()
  const adminAccess = resolveAdminAccess({
    ...(session.user.user_metadata || {}),
    role: profile?.role || session.user.user_metadata?.role,
  })
  if (!adminAccess.isSuperadmin) return jsonError('Forbidden', 403)

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || null
  const cursor = searchParams.get('cursor') || null

  let dbQuery = supabaseAdmin
    .from('app_store_server_notifications')
    .select('notification_uuid, notification_type, subtype, environment, original_transaction_id, status, last_error, signed_date, processed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (status && VALID_STATUSES.has(status)) dbQuery = dbQuery.eq('status', status)
  if (cursor) {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
    dbQuery = dbQuery.lt('created_at', decoded)
  }

  const { data: rows, error } = await dbQuery
  if (error) return jsonError('Failed to load notifications', 500)

  const hasMore = rows.length > PAGE_SIZE
  const page = rows.slice(0, PAGE_SIZE)

  const { data: counts } = await supabaseAdmin
    .from('app_store_server_notifications')
    .select('status')
  const statusCounts = { processing: 0, processed: 0, ignored: 0, failed: 0 }
  for (const row of counts ?? []) {
    const s = row.status as keyof typeof statusCounts
    if (s in statusCounts) statusCounts[s]++
  }

  const nextCursor = hasMore && page.length > 0
    ? Buffer.from(String(page.at(-1)!.created_at), 'utf8').toString('base64url')
    : null

  return NextResponse.json({ items: page, next_cursor: nextCursor, counts: statusCounts })
}
