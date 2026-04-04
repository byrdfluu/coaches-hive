import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import type { Session } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getAdminConfig, setAdminConfig } from '@/lib/adminConfig'
import { logAdminAction } from '@/lib/auditLog'
import { hasAdminPermission, resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const isMissingOrderDisputesTable = (message?: string | null) => {
  const normalized = String(message || '').toLowerCase()
  return normalized.includes('order_disputes') && (
    normalized.includes('does not exist')
    || normalized.includes('could not find')
    || normalized.includes('relation')
    || normalized.includes('schema cache')
  )
}

const resolveDisputesAccess = async (): Promise<
  | { response: NextResponse; session: null; canManage: false; canView: false }
  | { response: null; session: Session; canManage: boolean; canView: boolean }
> => {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { session: null, response: jsonError('Unauthorized', 401), canManage: false, canView: false }
  }

  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (!adminAccess.isAdmin || !adminAccess.teamRole) {
    return { session: null, response: jsonError('Forbidden', 403), canManage: false, canView: false }
  }

  const canView = true
  const canManage =
    hasAdminPermission(adminAccess.teamRole, 'finance.manage')
    || hasAdminPermission(adminAccess.teamRole, 'support.refund')

  return { session, response: null, canManage, canView }
}

export async function GET(request: Request) {
  const { response, canManage, canView } = await resolveDisputesAccess()
  if (response) return response
  if (!canView) return jsonError('Forbidden', 403)

  const url = new URL(request.url)
  const pageParam = Number(url.searchParams.get('page') || '1')
  const pageSizeParam = Number(url.searchParams.get('page_size') || '25')
  const page = Number.isFinite(pageParam) ? Math.max(1, Math.floor(pageParam)) : 1
  const pageSize = Number.isFinite(pageSizeParam)
    ? Math.min(100, Math.max(10, Math.floor(pageSizeParam)))
    : 25
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data: orders, error: ordersError, count } = await supabaseAdmin
    .from('orders')
    .select('id, coach_id, athlete_id, org_id, amount, total, price, status, refund_status, payment_intent_id, created_at', { count: 'exact' })
    .or('status.ilike.%disput%,status.ilike.%chargeback%,refund_status.not.is.null')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (ordersError) {
    return jsonError(ordersError.message)
  }

  const orderRows = (orders || []) as Array<Record<string, any>>
  const coachIds = Array.from(new Set(orderRows.map((row) => row.coach_id).filter(Boolean)))
  const athleteIds = Array.from(new Set(orderRows.map((row) => row.athlete_id).filter(Boolean)))
  const orgIds = Array.from(new Set(orderRows.map((row) => row.org_id).filter(Boolean)))
  const orderIds = Array.from(new Set(orderRows.map((row) => row.id).filter(Boolean)))
  const paymentIntents = Array.from(new Set(orderRows.map((row) => row.payment_intent_id).filter(Boolean)))

  let disputes: any[] = []
  if (orderIds.length || paymentIntents.length) {
    const disputeRows: any[] = []

    if (orderIds.length) {
      const { data: byOrderRows, error: byOrderError } = await supabaseAdmin
        .from('order_disputes')
        .select('order_id, payment_intent_id, status, reason, evidence_due_by')
        .in('order_id', orderIds)
      if (byOrderError && !isMissingOrderDisputesTable(byOrderError.message)) {
        return jsonError(byOrderError.message)
      }
      disputeRows.push(...(byOrderRows || []))
    }

    if (paymentIntents.length) {
      const { data: byIntentRows, error: byIntentError } = await supabaseAdmin
        .from('order_disputes')
        .select('order_id, payment_intent_id, status, reason, evidence_due_by')
        .in('payment_intent_id', paymentIntents)
      if (byIntentError && !isMissingOrderDisputesTable(byIntentError.message)) {
        return jsonError(byIntentError.message)
      }
      disputeRows.push(...(byIntentRows || []))
    }

    disputes = Array.from(
      new Map(
        disputeRows.map((row) => [
          `${row.order_id || ''}:${row.payment_intent_id || ''}`,
          row,
        ]),
      ).values(),
    )
  }

  const { data: coachRows } = coachIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', coachIds)
    : { data: [] }

  const { data: athleteRows } = athleteIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', athleteIds)
    : { data: [] }

  const { data: orgRows } = orgIds.length
    ? await supabaseAdmin
        .from('org_settings')
        .select('org_id, org_name')
        .in('org_id', orgIds)
    : { data: [] }

  const coaches = (coachRows || []).reduce<Record<string, { name: string; email: string }>>((acc, row) => {
    acc[row.id] = { name: row.full_name || row.email || 'Coach', email: row.email || '' }
    return acc
  }, {})

  const athletes = (athleteRows || []).reduce<Record<string, { name: string; email: string }>>((acc, row) => {
    acc[row.id] = { name: row.full_name || row.email || 'Athlete', email: row.email || '' }
    return acc
  }, {})

  const orgs = (orgRows || []).reduce<Record<string, string>>((acc, row) => {
    acc[row.org_id] = row.org_name || 'Organization'
    return acc
  }, {})

  const disputeMapByOrder = new Map<string, any>()
  const disputeMapByIntent = new Map<string, any>()
  disputes.forEach((row) => {
    if (row.order_id) disputeMapByOrder.set(row.order_id, row)
    if (row.payment_intent_id) disputeMapByIntent.set(row.payment_intent_id, row)
  })

  const ordersWithDisputes = orderRows.map((order) => {
    const dispute = disputeMapByOrder.get(order.id) || (order.payment_intent_id ? disputeMapByIntent.get(order.payment_intent_id) : null)
    return {
      ...order,
      dispute_reason: dispute?.reason || null,
      dispute_status: dispute?.status || null,
      dispute_deadline: dispute?.evidence_due_by || null,
    }
  })

  const settings = await getAdminConfig('dispute_settings')
  const total = Number(count || 0) || 0
  const hasNext = to + 1 < total

  return NextResponse.json({
    orders: ordersWithDisputes,
    coaches,
    athletes,
    orgs,
    settings,
    permissions: {
      can_manage: canManage,
    },
    pagination: {
      page,
      page_size: pageSize,
      total,
      has_next: hasNext,
    },
  })
}

export async function POST(request: Request) {
  const { session, response, canManage } = await resolveDisputesAccess()
  if (response || !session) return response ?? jsonError('Unauthorized', 401)
  if (!canManage) return jsonError('Forbidden', 403)

  const payload = await request.json().catch(() => ({}))
  const settings = payload?.settings
  if (!settings) {
    return jsonError('settings are required')
  }

  await setAdminConfig('dispute_settings', settings)
  await logAdminAction({
    action: 'admin.disputes.settings_update',
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'admin_config',
    targetId: 'dispute_settings',
  })

  return NextResponse.json({ settings })
}

export async function PATCH(request: Request) {
  const { session, response, canManage } = await resolveDisputesAccess()
  if (response || !session) return response ?? jsonError('Unauthorized', 401)
  if (!canManage) return jsonError('Forbidden', 403)

  const payload = await request.json().catch(() => ({}))
  const orderId = String(payload?.order_id || '').trim()
  const action = String(payload?.action || '').trim().toLowerCase()

  if (!orderId) return jsonError('order_id is required')
  if (!['submit_evidence', 'mark_won', 'mark_lost', 'reopen'].includes(action)) {
    return jsonError('action must be one of submit_evidence, mark_won, mark_lost, reopen')
  }

  const { data: currentOrder, error: orderLoadError } = await supabaseAdmin
    .from('orders')
    .select('id, status, refund_status, payment_intent_id')
    .eq('id', orderId)
    .maybeSingle()

  if (orderLoadError) return jsonError(orderLoadError.message, 500)
  if (!currentOrder) return jsonError('Order not found', 404)

  const disputeStatusByAction: Record<string, string> = {
    submit_evidence: 'under_review',
    mark_won: 'won',
    mark_lost: 'lost',
    reopen: 'needs_response',
  }
  const orderStatusByAction: Record<string, string> = {
    submit_evidence: 'disputed',
    mark_won: 'paid',
    mark_lost: 'chargeback',
    reopen: 'disputed',
  }

  const nextDisputeStatus = disputeStatusByAction[action]
  const nextOrderStatus = orderStatusByAction[action]

  const orderUpdates: Record<string, any> = {
    status: nextOrderStatus,
  }
  if (action === 'mark_lost') {
    orderUpdates.refund_status = 'chargeback'
  }
  if (action === 'mark_won' && String(currentOrder.refund_status || '').toLowerCase() === 'chargeback') {
    orderUpdates.refund_status = null
  }

  const { data: updatedOrder, error: updateOrderError } = await supabaseAdmin
    .from('orders')
    .update(orderUpdates)
    .eq('id', orderId)
    .select('id, status, refund_status, payment_intent_id')
    .single()

  if (updateOrderError) return jsonError(updateOrderError.message, 500)

  const paymentIntentId = String(updatedOrder?.payment_intent_id || currentOrder.payment_intent_id || '')
  let existingDispute: any = null

  const { data: byOrderDispute, error: byOrderDisputeError } = await supabaseAdmin
    .from('order_disputes')
    .select('order_id, payment_intent_id, status')
    .eq('order_id', orderId)
    .maybeSingle()
  if (byOrderDisputeError && !isMissingOrderDisputesTable(byOrderDisputeError.message)) {
    return jsonError(byOrderDisputeError.message, 500)
  }
  existingDispute = byOrderDispute

  if (!existingDispute && paymentIntentId) {
    const { data: byIntentDispute, error: byIntentDisputeError } = await supabaseAdmin
      .from('order_disputes')
      .select('order_id, payment_intent_id, status')
      .eq('payment_intent_id', paymentIntentId)
      .maybeSingle()
    if (byIntentDisputeError && !isMissingOrderDisputesTable(byIntentDisputeError.message)) {
      return jsonError(byIntentDisputeError.message, 500)
    }
    existingDispute = byIntentDispute
  }

  const canPersistDisputeRecord = !byOrderDisputeError || !isMissingOrderDisputesTable(byOrderDisputeError?.message)
  if (canPersistDisputeRecord && existingDispute?.order_id) {
    await supabaseAdmin
      .from('order_disputes')
      .update({ status: nextDisputeStatus })
      .eq('order_id', existingDispute.order_id)
  } else if (canPersistDisputeRecord && existingDispute?.payment_intent_id) {
    await supabaseAdmin
      .from('order_disputes')
      .update({ status: nextDisputeStatus })
      .eq('payment_intent_id', existingDispute.payment_intent_id)
  } else if (canPersistDisputeRecord) {
    await supabaseAdmin
      .from('order_disputes')
      .insert({
        order_id: orderId,
        payment_intent_id: paymentIntentId || null,
        status: nextDisputeStatus,
      })
  }

  const { data: latestDispute, error: latestDisputeError } = await supabaseAdmin
    .from('order_disputes')
    .select('status, reason, evidence_due_by')
    .eq('order_id', orderId)
    .maybeSingle()
  if (latestDisputeError && !isMissingOrderDisputesTable(latestDisputeError.message)) {
    return jsonError(latestDisputeError.message, 500)
  }

  await logAdminAction({
    action: `admin.disputes.${action}`,
    actorId: session.user.id,
    actorEmail: session.user.email || null,
    targetType: 'order',
    targetId: orderId,
    metadata: {
      from_order_status: currentOrder.status || null,
      to_order_status: updatedOrder.status || null,
      from_refund_status: currentOrder.refund_status || null,
      to_refund_status: updatedOrder.refund_status || null,
      dispute_status: latestDispute?.status || nextDisputeStatus,
    },
  })

  return NextResponse.json({
    ok: true,
    order: {
      ...updatedOrder,
      dispute_status: latestDispute?.status || nextDisputeStatus,
      dispute_reason: latestDispute?.reason || null,
      dispute_deadline: latestDispute?.evidence_due_by || null,
    },
  })
}
