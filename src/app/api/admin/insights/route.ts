import { NextResponse } from 'next/server'
import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { enrichWithWorkspace } from '@/lib/workspaceAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { filterAdminTestRows, shouldShowTestData } from '@/lib/adminTestData'

export const dynamic = 'force-dynamic'

const numberValue = (value: unknown) => Number(value || 0)
const applyCommonFilters = (query: any, p: URLSearchParams, dateColumn = 'created_at') => {
  const pairs: [string, string][] = [
    ['workspace_id', 'workspace_id'], ['checkout_type', 'checkout_type'],
    ['payment_intent_id', 'stripe_payment_intent_id'], ['checkout_session_id', 'stripe_checkout_session_id'],
  ]
  for (const [param, column] of pairs) { const value = p.get(param); if (value) query = query.eq(column, value) }
  const from = p.get('from'), to = p.get('to')
  if (from) query = query.gte(dateColumn, `${from}T00:00:00.000Z`)
  if (to) query = query.lte(dateColumn, `${to}T23:59:59.999Z`)
  return query
}

export async function GET(request: Request) {
  const auth = await requireSuperadminApi(); if (auth.error) return auth.error
  const p = new URL(request.url).searchParams
  const metric = p.get('metric') || 'gross_volume'
  const showTestData = shouldShowTestData(p)
  const supabase = await createRouteHandlerClientCompat()
  const [summaryRpc, engagementRpc] = await Promise.all([
    supabase.rpc('admin_insights_summary'),
    supabase.rpc('admin_organization_engagement'),
  ])
  if (summaryRpc.error) return NextResponse.json({ error: 'Deploy 20260808050000_superadmin_insights_and_safe_actions.sql first.' }, { status: 503 })

  let accountingQuery: any = supabaseAdmin.from('stripe_connect_payment_accounting').select('*').eq('livemode', true).order('created_at', { ascending: false }).limit(500)
  accountingQuery = applyCommonFilters(accountingQuery, p)
  const workspaceType = p.get('workspace_type')
  const channel = p.get('channel')
  let subscriptionQuery: any = supabaseAdmin.from('platform_subscriptions').select('*').order('updated_at', { ascending: false }).limit(500)
  const workspaceId = p.get('workspace_id'), subStatus = p.get('subscription_status'), customer = p.get('stripe_customer_id'), subscription = p.get('stripe_subscription_id')
  if (workspaceId) subscriptionQuery = subscriptionQuery.eq('workspace_id', workspaceId)
  if (subStatus) subscriptionQuery = subscriptionQuery.eq('status', subStatus)
  if (channel) subscriptionQuery = subscriptionQuery.eq('purchase_channel', channel)
  if (customer) subscriptionQuery = subscriptionQuery.eq('stripe_customer_id', customer)
  if (subscription) subscriptionQuery = subscriptionQuery.eq('stripe_subscription_id', subscription)
  const from = p.get('from'), to = p.get('to')
  if (from) subscriptionQuery = subscriptionQuery.gte('updated_at', `${from}T00:00:00.000Z`)
  if (to) subscriptionQuery = subscriptionQuery.lte('updated_at', `${to}T23:59:59.999Z`)

  let refundQuery: any = supabaseAdmin.from('payment_refund_requests').select('*').eq('status', 'refunded').order('resolved_at', { ascending: false }).limit(500)
  if (workspaceId) refundQuery = refundQuery.eq('workspace_id', workspaceId)
  if (from) refundQuery = refundQuery.gte('resolved_at', `${from}T00:00:00.000Z`)
  if (to) refundQuery = refundQuery.lte('resolved_at', `${to}T23:59:59.999Z`)

  const [accounting, subscriptions, refunds, workspaces] = await Promise.all([
    accountingQuery, subscriptionQuery, refundQuery,
    supabaseAdmin.from('business_workspaces').select('id,workspace_type,display_name,organization_id,status,is_test'),
  ])
  let accountingRows: any[] = await filterAdminTestRows(accounting.data || [], showTestData)
  let subscriptionRows: any[] = await filterAdminTestRows(subscriptions.data || [], showTestData)
  const refundRows: any[] = await filterAdminTestRows(refunds.data || [], showTestData)
  const workspaceRows: any[] = showTestData ? (workspaces.data || []) : (workspaces.data || []).filter((row:any) => !row.is_test)
  const workspaceMap = new Map(workspaceRows.map((w: any) => [w.id, w]))
  if (workspaceType) {
    accountingRows = accountingRows.filter((r) => workspaceMap.get(r.workspace_id)?.workspace_type === workspaceType)
    subscriptionRows = subscriptionRows.filter((r) => workspaceMap.get(r.workspace_id)?.workspace_type === workspaceType)
  }
  const filtered = Boolean(Array.from(p.keys()).some((key) => key !== 'metric'))
  const gross = accountingRows.reduce((n, r) => n + numberValue(r.gross_amount_cents), 0)
  const fees = accountingRows.reduce((n, r) => n + numberValue(r.platform_fee_cents), 0)
  const sellerNet = accountingRows.reduce((n, r) => n + numberValue(r.net_amount_cents), 0)
  const refunded = refundRows.reduce((n: number, r: any) => n + Math.round(numberValue(r.amount) * 100), 0)
  const eligibleSubs = subscriptionRows.filter((r) => ['active', 'trialing'].includes(r.status))
  const mrr = eligibleSubs.reduce((n, r) => n + numberValue(r.renewal_amount_cents) / (r.billing_interval === 'year' ? 12 : 1), 0)
  const base: any = summaryRpc.data || {}
  const summary = filtered ? {
    ...base, gross_volume_cents: gross, platform_fee_cents: fees, seller_net_cents: sellerNet,
    refunded_amount_cents: refunded, mrr_cents: mrr, active_subscriptions: subscriptionRows.filter(r => r.status === 'active').length,
    trials: subscriptionRows.filter(r => r.status === 'trialing').length, past_due: subscriptionRows.filter(r => ['past_due', 'unpaid'].includes(r.status)).length,
    canceled_30d: subscriptionRows.filter(r => r.status === 'canceled' && Date.parse(r.updated_at) >= Date.now() - 30 * 864e5).length,
  } : base
  summary.arr_cents = Math.round(numberValue(summary.mrr_cents) * 12)
  summary.coaches_hive_revenue_cents = numberValue(summary.platform_fee_cents) + numberValue(summary.mrr_cents)

  let records: any[] = accountingRows
  if (['refunds'].includes(metric)) records = refundRows
  if (['mrr', 'arr', 'active_subscriptions', 'trials', 'past_due', 'canceled_30d'].includes(metric)) records = subscriptionRows
  if (metric === 'accounts') { const result = await supabaseAdmin.from('profiles').select('id,email,role,is_test,created_at').order('created_at', { ascending: false }).limit(500); records = showTestData ? result.data || [] : (result.data || []).filter((row:any)=>!row.is_test) }
  if (metric === 'workspaces') records = workspaceRows

  const baseEngagement: any[] = (engagementRpc.data || []).filter((row:any) => showTestData || !workspaceMap.get(row.workspace_id)?.is_test)
  const engagementWorkspaceIds = baseEngagement.map(r => r.workspace_id), engagementOrgIds = baseEngagement.map(r => r.organization_id).filter(Boolean)
  const [engagementSubs, engagementConnect, engagementRequests, engagementReconciliation, engagementDocuments] = await Promise.all([
    engagementWorkspaceIds.length ? supabaseAdmin.from('platform_subscriptions').select('workspace_id,status,tier,purchase_channel,current_period_end').in('workspace_id', engagementWorkspaceIds) : Promise.resolve({ data: [] }),
    engagementWorkspaceIds.length ? supabaseAdmin.from('stripe_connect_accounts').select('workspace_id,charges_enabled,payouts_enabled,stripe_account_id').in('workspace_id', engagementWorkspaceIds) : Promise.resolve({ data: [] }),
    engagementWorkspaceIds.length ? supabaseAdmin.from('athlete_access_requests').select('workspace_id,status').in('workspace_id', engagementWorkspaceIds).eq('status','requested') : Promise.resolve({ data: [] }),
    engagementWorkspaceIds.length ? supabaseAdmin.from('workspace_reconciliation_queue').select('workspace_id,status').in('workspace_id', engagementWorkspaceIds).neq('status','resolved') : Promise.resolve({ data: [] }),
    engagementOrgIds.length ? supabaseAdmin.from('org_documents').select('id,org_id,created_at').in('org_id', engagementOrgIds).gte('created_at', new Date(Date.now()-30*864e5).toISOString()) : Promise.resolve({ data: [] }),
  ])
  const engagement = await enrichWithWorkspace(baseEngagement.map(r => {
    const sub = (engagementSubs.data || []).find((x:any) => x.workspace_id === r.workspace_id)
    const connect = (engagementConnect.data || []).find((x:any) => x.workspace_id === r.workspace_id)
    return { ...r, document_activity_30d: (engagementDocuments.data || []).filter((x:any) => x.org_id === r.organization_id).length,
      subscription_status: sub?.status || 'none', subscription_plan: sub?.tier || null,
      connect_ready: Boolean(connect?.charges_enabled && connect?.payouts_enabled),
      outstanding_athlete_access: (engagementRequests.data || []).filter((x:any) => x.workspace_id === r.workspace_id).length,
      outstanding_reconciliation: (engagementReconciliation.data || []).filter((x:any) => x.workspace_id === r.workspace_id).length }
  }))
  return NextResponse.json({ summary, records: await enrichWithWorkspace(records), engagement, filters: Object.fromEntries(p.entries()) })
}
