import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/apiAuth'
import { resolveAdminAccess } from '@/lib/adminRoles'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { loadWorkspaceDisplayMap, resolveWorkspaceIdsForAdminSearch } from '@/lib/workspaceAdmin'
import { filterAdminTestRows, shouldShowTestData } from '@/lib/adminTestData'

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
  const workspaceId = searchParams.get('workspace_id') || null
  const showTestData = shouldShowTestData(searchParams)

  let userIdFilter: string[] | null = null
  let workspaceIdFilter: string[] = []
  if (query) {
    const [{ data: matchingProfiles }, resolvedWorkspaces] = await Promise.all([
      supabaseAdmin.from('profiles').select('id').or(`email.ilike.%${query}%,full_name.ilike.%${query}%`).limit(200),
      resolveWorkspaceIdsForAdminSearch(query),
    ])
    userIdFilter = (matchingProfiles || []).map((p) => p.id)
    workspaceIdFilter = Array.from(resolvedWorkspaces)
  }

  let dbQuery = supabaseAdmin
    .from('platform_subscriptions')
    .select(`
      user_id,
      workspace_id,
      owner_type,
      tier,
      status,
      billing_interval,
      current_period_end,
      current_period_start,
      trial_end,
      updated_at,
      cancel_at_period_end,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      apple_product_id,
      apple_environment,
      currency,
      renewal_amount_cents,
      purchase_channel,
      created_at,
      profiles!user_id ( email, full_name, is_test )
    `)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1)

  if (workspaceId) dbQuery = dbQuery.eq('workspace_id', workspaceId)
  else if (query && userIdFilter) {
    const escaped = query.replaceAll(',', '')
    const filters = [
      userIdFilter.length ? `user_id.in.(${userIdFilter.join(',')})` : null,
      workspaceIdFilter.length ? `workspace_id.in.(${workspaceIdFilter.join(',')})` : null,
      `stripe_customer_id.ilike.%${escaped}%`,
      `stripe_subscription_id.ilike.%${escaped}%`,
    ].filter(Boolean).join(',')
    dbQuery = dbQuery.or(filters)
  }
  if (cursor) {
    const decodedCursor = Buffer.from(cursor, 'base64url').toString('utf8')
    dbQuery = dbQuery.lt('created_at', decodedCursor)
  }

  const { data: rows, error } = await dbQuery
  if (error) return jsonError('Failed to load subscriptions', 500)

  const hasMore = rows.length > PAGE_SIZE
  const page = rows.slice(0, PAGE_SIZE)
  const workspaceIds = Array.from(new Set(page.map((row: any) => row.workspace_id).filter(Boolean)))
  const workspaceMap = await loadWorkspaceDisplayMap(workspaceIds)

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
    const purchaseChannel = (row.purchase_channel as string | null) || null
    return {
      user_id: row.user_id,
      workspace_id: row.workspace_id || null,
      ...(row.workspace_id ? workspaceMap.get(String(row.workspace_id)) : null),
      email: profile.email || null,
      full_name: profile.full_name || null,
      is_test: Boolean(profile.is_test || (row.workspace_id && workspaceMap.get(String(row.workspace_id))?.workspace_is_test)),
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
      current_period_start: row.current_period_start || null,
      trial_end: row.trial_end || null,
      updated_at: row.updated_at || null,
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      stripe_customer_id: row.stripe_customer_id || null,
      stripe_subscription_id: row.stripe_subscription_id || null,
      stripe_price_id: row.stripe_price_id || null,
      apple_product_id: row.apple_product_id || null,
      apple_environment: row.apple_environment || null,
      currency: row.currency || 'usd',
      renewal_amount: row.renewal_amount_cents ?? null,
    }
  })

  const lastRow = page.at(-1)
  const nextCursor = hasMore && lastRow
    ? Buffer.from(lastRow.created_at, 'utf8').toString('base64url')
    : null

  return NextResponse.json({ items: await filterAdminTestRows(items, showTestData), next_cursor: nextCursor })
}
