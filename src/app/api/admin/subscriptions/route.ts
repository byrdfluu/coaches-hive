import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PAGE_SIZE = 25

export async function GET(request: Request) {
  const mobileUser = await getMobileRequestUser(request)
  const supabase = mobileUser ? null : await createRouteHandlerClientCompat()
  const { data: { session } } = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } }
  const user = mobileUser || session?.user
  if (!user) return jsonError('Unauthorized', 401)

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const adminAccess = resolveAdminAccess({
    ...(user.user_metadata || {}),
    role: profile?.role || user.user_metadata?.role,
  })
  if (!adminAccess.isSuperadmin) return jsonError('Forbidden', 403)

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query')?.trim() || null
  const cursor = searchParams.get('cursor') || null

  let userIdFilter: string[] | null = null
  if (query) {
    const { data: matchingProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .or(`email.ilike.%${query}%,full_name.ilike.%${query}%`)
      .limit(200)
    userIdFilter = (matchingProfiles || []).map((p) => p.id)
    if (userIdFilter.length === 0) {
      return NextResponse.json({ items: [], next_cursor: null })
    }
  }

  let dbQuery = supabaseAdmin
    .from('platform_subscriptions')
    .select(`
      user_id,
      owner_type,
      tier,
      status,
      billing_interval,
      current_period_end,
      cancel_at_period_end,
      currency,
      renewal_amount_cents,
      purchase_channel,
      included_coach_quantity,
      billable_coach_quantity,
      created_at,
      profiles!user_id ( email, full_name )
    `)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (userIdFilter) dbQuery = dbQuery.in('user_id', userIdFilter)
  if (cursor) {
    const decodedCursor = Buffer.from(cursor, 'base64url').toString('utf8')
    dbQuery = dbQuery.lt('created_at', decodedCursor)
  }

  const { data: rows, error } = await dbQuery
  if (error) return jsonError('Failed to load subscriptions', 500)

  const hasMore = rows.length > PAGE_SIZE
  const page = rows.slice(0, PAGE_SIZE)

  const appleUserIds = page
    .filter((r: any) => r.purchase_channel === 'apple_iap')
    .map((r: any) => r.user_id as string)
  const appleTransactionMap = new Map<string, string>()
  if (appleUserIds.length > 0) {
    const { data: appleRows } = await supabaseAdmin
      .from('apple_iap_subscriptions')
      .select('owner_id, original_transaction_id')
      .in('owner_id', appleUserIds)
    for (const row of appleRows ?? []) {
      appleTransactionMap.set(String(row.owner_id), String(row.original_transaction_id))
    }
  }

  const items = page.map((row: any) => {
    const profile = row.profiles || {}
    const isOrg = row.owner_type === 'org'
    const includedSeats = isOrg ? Number(row.included_coach_quantity ?? 1) : null
    const additionalSeats = isOrg ? Number(row.billable_coach_quantity ?? 0) : null
    const purchaseChannel = (row.purchase_channel as string | null) || null
    return {
      user_id: row.user_id,
      email: profile.email || null,
      full_name: profile.full_name || null,
      purchase_channel: purchaseChannel,
      apple_original_transaction_id: purchaseChannel === 'apple_iap'
        ? (appleTransactionMap.get(String(row.user_id)) ?? null)
        : null,
      has_access: ['active', 'trialing'].includes(String(row.status || '')),
      status: row.status || null,
      billing_role: row.owner_type || null,
      plan_key: row.tier || null,
      billing_interval: row.billing_interval === 'year' ? 'annual' : 'monthly',
      current_period_end: row.current_period_end || null,
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      currency: row.currency || 'usd',
      renewal_amount: row.renewal_amount_cents ?? null,
      active_seat_count: isOrg ? (includedSeats! + additionalSeats!) : null,
      included_seat_count: includedSeats,
      additional_seat_count: additionalSeats,
    }
  })

  const lastRow = page.at(-1)
  const nextCursor = hasMore && lastRow
    ? Buffer.from(lastRow.created_at, 'utf8').toString('base64url')
    : null

  return NextResponse.json({ items, next_cursor: nextCursor })
}
