import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction } from '@/lib/auditLog'
import { getAdminConfig, setAdminConfig } from '@/lib/adminConfig'
import { normalizeAdminTeamRole, resolveAdminAccess } from '@/lib/adminRoles'
export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

type SecurityConfig = {
  dual_approval_payouts?: boolean
  pending_payout_approvals?: PendingApproval[]
}

type PendingApproval = {
  payout_id: string
  status: string
  requested_by?: string | null
  requested_at?: string | null
}

type PayoutOpsConfig = {
  hold_payout_ids?: string[]
  failure_reasons?: Record<string, string>
  reconciliation?: {
    last_run_at?: string | null
    mismatch_count?: number
    mismatch_sample_ids?: string[]
    last_run_by?: string | null
  }
}

type PayoutRecord = {
  id: string
  coach_id: string
  session_payment_id?: string | null
  amount?: number | string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  paid_at?: string | null
  scheduled_for?: string | null
}

const VALID_DB_STATUSES = new Set(['scheduled', 'paid', 'failed'])

const toAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? NaN)
  return Number.isFinite(num) ? num : 0
}

const normalizeStatus = (value: string | null | undefined) => String(value || '').toLowerCase()

const normalizeWorkflowStatus = (
  payoutId: string,
  baseStatus: string,
  pendingMap: Map<string, PendingApproval>,
  holdSet: Set<string>,
) => {
  if (holdSet.has(payoutId)) return 'on_hold'
  if (pendingMap.has(payoutId)) return 'pending_approval'
  if (baseStatus === 'paid') return 'paid'
  if (baseStatus === 'failed') return 'failed'
  return 'scheduled'
}

const computeMismatchSummary = (
  payouts: Array<Pick<PayoutRecord, 'id' | 'status' | 'paid_at'>>,
  holdSet: Set<string>,
) => {
  const mismatches = payouts.filter((row) => {
    const status = normalizeStatus(row.status)
    const hasPaidAt = Boolean(row.paid_at)
    const held = holdSet.has(row.id)

    if (held && status === 'paid') return true
    if (status === 'paid' && !hasPaidAt) return true
    if (status !== 'paid' && hasPaidAt) return true

    return false
  })

  return {
    mismatch_count: mismatches.length,
    mismatch_sample_ids: mismatches.slice(0, 10).map((row) => row.id),
  }
}

const requireFinanceAdmin = async () => {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { session: null, error: jsonError('Unauthorized', 401) }
  }

  const adminAccess = resolveAdminAccess(session.user.user_metadata)
  if (adminAccess.teamRole !== 'finance' && adminAccess.teamRole !== 'superadmin') {
    return { session: null, error: jsonError('Forbidden', 403) }
  }

  return { session, error: null as NextResponse | null }
}

export async function GET(request: Request) {
  const { error } = await requireFinanceAdmin()
  if (error) return error

  const url = new URL(request.url)
  const pageParam = Number(url.searchParams.get('page') || '1')
  const pageSizeParam = Number(url.searchParams.get('page_size') || '25')
  const page = Number.isFinite(pageParam) ? Math.max(1, Math.floor(pageParam)) : 1
  const pageSize = Number.isFinite(pageSizeParam)
    ? Math.min(100, Math.max(10, Math.floor(pageSizeParam)))
    : 25

  const statusFilter = String(url.searchParams.get('status') || 'all').toLowerCase()
  const query = String(url.searchParams.get('query') || '').trim().toLowerCase()
  const dateFrom = String(url.searchParams.get('date_from') || '').trim()
  const dateTo = String(url.searchParams.get('date_to') || '').trim()

  const securityConfig = (await getAdminConfig<SecurityConfig>('security')) || {}
  const payoutOps = (await getAdminConfig<PayoutOpsConfig>('payout_ops')) || {}

  const pendingApprovals = Array.isArray(securityConfig.pending_payout_approvals)
    ? securityConfig.pending_payout_approvals
    : []
  const pendingApprovalMap = new Map(
    pendingApprovals
      .filter((item) => String(item?.payout_id || '').trim())
      .map((item) => [String(item.payout_id), item]),
  )
  const holdSet = new Set(
    Array.isArray(payoutOps.hold_payout_ids)
      ? payoutOps.hold_payout_ids.filter((id) => String(id || '').trim())
      : [],
  )
  const failureReasons = (payoutOps.failure_reasons || {}) as Record<string, string>

  let payoutsQuery = supabaseAdmin
    .from('coach_payouts')
    .select('id, amount, status, coach_id, session_payment_id, created_at, paid_at, scheduled_for, updated_at')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (dateFrom) {
    const start = new Date(`${dateFrom}T00:00:00.000Z`)
    if (Number.isFinite(start.getTime())) {
      payoutsQuery = payoutsQuery.gte('created_at', start.toISOString())
    }
  }
  if (dateTo) {
    const end = new Date(`${dateTo}T23:59:59.999Z`)
    if (Number.isFinite(end.getTime())) {
      payoutsQuery = payoutsQuery.lte('created_at', end.toISOString())
    }
  }

  if (VALID_DB_STATUSES.has(statusFilter)) {
    payoutsQuery = payoutsQuery.eq('status', statusFilter)
  }

  const { data: payoutRows, error: payoutsError } = await payoutsQuery
  if (payoutsError) {
    return jsonError(payoutsError.message)
  }

  const baseRows = (payoutRows || []) as unknown as PayoutRecord[]
  const coachIds = Array.from(new Set(baseRows.map((row) => row.coach_id).filter(Boolean)))
  const paymentIds = Array.from(
    new Set(baseRows.map((row) => String(row.session_payment_id || '')).filter(Boolean)),
  )

  const { data: profiles } = coachIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email, bank_last4')
        .in('id', coachIds)
    : { data: [] }

  const { data: paymentRows } = paymentIds.length
    ? await supabaseAdmin
        .from('session_payments')
        .select('id, payment_method, status, paid_at, created_at')
        .in('id', paymentIds)
    : { data: [] }

  const profileMap = new Map(
    (profiles || []).map((profile: any) => [
      String(profile.id),
      {
        name: profile.full_name || profile.email || 'Coach',
        email: profile.email || '',
        bank_last4: profile.bank_last4 || null,
      },
    ]),
  )
  const paymentMap = new Map(
    (paymentRows || []).map((payment: any) => [String(payment.id), payment]),
  )

  let enriched = baseRows.map((row) => {
    const status = normalizeStatus(row.status)
    const workflowStatus = normalizeWorkflowStatus(row.id, status, pendingApprovalMap, holdSet)
    const profile = profileMap.get(String(row.coach_id))
    const payment = row.session_payment_id ? paymentMap.get(String(row.session_payment_id)) : null
    return {
      id: row.id,
      coach_id: row.coach_id,
      coach: profile?.name || 'Coach',
      coach_email: profile?.email || '',
      bank_last4: profile?.bank_last4 || null,
      amount: toAmount(row.amount),
      status,
      workflow_status: workflowStatus,
      scheduled_for: row.scheduled_for || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      paid_at: row.paid_at || null,
      session_payment_id: row.session_payment_id || null,
      payment_method: payment?.payment_method || null,
      payment_status: payment?.status || null,
      payment_paid_at: payment?.paid_at || null,
      failure_reason: failureReasons[row.id] || null,
      pending_approval: pendingApprovalMap.get(row.id) || null,
    }
  })

  if (statusFilter === 'pending_approval') {
    enriched = enriched.filter((row) => row.workflow_status === 'pending_approval')
  } else if (statusFilter === 'on_hold') {
    enriched = enriched.filter((row) => row.workflow_status === 'on_hold')
  }

  if (query) {
    enriched = enriched.filter((row) => {
      const haystack = [
        row.id,
        row.coach,
        row.coach_email,
        row.status,
        row.workflow_status,
        row.session_payment_id,
        row.payment_method,
        row.failure_reason,
      ]
        .map((item) => String(item || '').toLowerCase())
        .join(' ')
      return haystack.includes(query)
    })
  }

  const total = enriched.length
  const from = (page - 1) * pageSize
  const to = from + pageSize
  const pageRows = enriched.slice(from, to)

  const summary = enriched.reduce(
    (acc, row) => {
      acc.total_count += 1
      acc.total_amount += row.amount
      if (row.workflow_status === 'scheduled') acc.scheduled_count += 1
      if (row.workflow_status === 'pending_approval') acc.pending_approval_count += 1
      if (row.workflow_status === 'on_hold') acc.on_hold_count += 1
      if (row.workflow_status === 'paid') acc.paid_count += 1
      if (row.workflow_status === 'failed') acc.failed_count += 1
      return acc
    },
    {
      total_count: 0,
      total_amount: 0,
      scheduled_count: 0,
      pending_approval_count: 0,
      on_hold_count: 0,
      paid_count: 0,
      failed_count: 0,
    },
  )

  const pendingQueue = pendingApprovals
    .map((entry) => {
      const payoutId = String(entry?.payout_id || '')
      if (!payoutId) return null
      const payout = enriched.find((row) => row.id === payoutId)
      return {
        payout_id: payoutId,
        status: entry?.status || 'paid',
        requested_by: entry?.requested_by || null,
        requested_at: entry?.requested_at || null,
        payout: payout || null,
      }
    })
    .filter(Boolean)

  const reconciliationBase = computeMismatchSummary(baseRows, holdSet)
  const persistedReconciliation = payoutOps.reconciliation || {}

  return NextResponse.json({
    payouts: pageRows,
    pagination: {
      page,
      page_size: pageSize,
      total,
      has_next: to < total,
    },
    summary,
    pending_approvals: pendingQueue,
    reconciliation: {
      last_run_at: persistedReconciliation.last_run_at || null,
      mismatch_count:
        typeof persistedReconciliation.mismatch_count === 'number'
          ? persistedReconciliation.mismatch_count
          : reconciliationBase.mismatch_count,
      mismatch_sample_ids:
        Array.isArray(persistedReconciliation.mismatch_sample_ids)
          ? persistedReconciliation.mismatch_sample_ids
          : reconciliationBase.mismatch_sample_ids,
      last_run_by: persistedReconciliation.last_run_by || null,
      live_mismatch_count: reconciliationBase.mismatch_count,
    },
  })
}

export async function POST(request: Request) {
  const { session, error } = await requireFinanceAdmin()
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const payload = await request.json().catch(() => ({}))
  const payoutId = String(payload?.payout_id || '').trim()
  const actionRaw = String(payload?.action || '').trim().toLowerCase()
  const statusRaw = String(payload?.status || '').trim().toLowerCase()
  const note = String(payload?.note || '').trim()

  const action = actionRaw || (statusRaw === 'paid'
    ? 'mark_paid'
    : statusRaw === 'failed'
    ? 'mark_failed'
    : statusRaw === 'scheduled'
    ? 'retry'
    : '')

  if (action === 'reconcile') {
    const securityConfig = (await getAdminConfig<SecurityConfig>('security')) || {}
    const payoutOps = (await getAdminConfig<PayoutOpsConfig>('payout_ops')) || {}
    const holdSet = new Set(
      Array.isArray(payoutOps.hold_payout_ids)
        ? payoutOps.hold_payout_ids.filter((id) => String(id || '').trim())
        : [],
    )

    const { data: rows, error: rowsError } = await supabaseAdmin
      .from('coach_payouts')
      .select('id, status, paid_at')
      .order('created_at', { ascending: false })
      .limit(1000)

    if (rowsError) return jsonError(rowsError.message, 500)

    const mismatch = computeMismatchSummary((rows || []) as any, holdSet)
    const nextPayoutOps: PayoutOpsConfig = {
      ...(payoutOps || {}),
      hold_payout_ids: Array.from(holdSet),
      failure_reasons: payoutOps.failure_reasons || {},
      reconciliation: {
        last_run_at: new Date().toISOString(),
        mismatch_count: mismatch.mismatch_count,
        mismatch_sample_ids: mismatch.mismatch_sample_ids,
        last_run_by: session.user.id,
      },
    }

    await setAdminConfig('payout_ops', nextPayoutOps as Record<string, any>)

    await logAdminAction({
      action: 'admin.payouts.reconcile',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'admin_config',
      targetId: 'payout_ops',
      metadata: {
        mismatch_count: mismatch.mismatch_count,
      },
    })

    return NextResponse.json({
      ok: true,
      reconciliation: nextPayoutOps.reconciliation,
      pending_approval_count: Array.isArray(securityConfig.pending_payout_approvals)
        ? securityConfig.pending_payout_approvals.length
        : 0,
    })
  }

  if (!payoutId) {
    return jsonError('payout_id is required')
  }

  if (![
    'mark_paid',
    'approve_pending',
    'reject_pending',
    'mark_failed',
    'retry',
    'set_hold',
    'release_hold',
    'set_failure_reason',
  ].includes(action)) {
    return jsonError('Unsupported payout action')
  }

  const { data: payout, error: payoutError } = await supabaseAdmin
    .from('coach_payouts')
    .select('id, amount, status, coach_id, session_payment_id, created_at, paid_at, scheduled_for, updated_at')
    .eq('id', payoutId)
    .maybeSingle()

  if (payoutError) return jsonError(payoutError.message, 500)
  if (!payout) return jsonError('Payout not found', 404)

  const securityConfig = (await getAdminConfig<SecurityConfig>('security')) || {}
  const payoutOps = (await getAdminConfig<PayoutOpsConfig>('payout_ops')) || {}

  let pendingApprovals = Array.isArray(securityConfig.pending_payout_approvals)
    ? securityConfig.pending_payout_approvals
    : []
  const holdSet = new Set(
    Array.isArray(payoutOps.hold_payout_ids)
      ? payoutOps.hold_payout_ids.filter((id) => String(id || '').trim())
      : [],
  )
  const failureReasons = {
    ...(payoutOps.failure_reasons || {}),
  }

  const saveConfigs = async () => {
    await setAdminConfig('security', {
      ...(securityConfig || {}),
      pending_payout_approvals: pendingApprovals,
    })
    await setAdminConfig('payout_ops', {
      ...(payoutOps || {}),
      hold_payout_ids: Array.from(holdSet),
      failure_reasons: failureReasons,
      reconciliation: payoutOps.reconciliation || {
        last_run_at: null,
        mismatch_count: 0,
        mismatch_sample_ids: [],
        last_run_by: null,
      },
    })
  }

  const removePendingForPayout = () => {
    pendingApprovals = pendingApprovals.filter(
      (entry) => String(entry?.payout_id || '') !== payoutId,
    )
  }

  const currentStatus = normalizeStatus(payout.status)

  if ((action === 'mark_paid' || action === 'approve_pending') && holdSet.has(payoutId)) {
    return jsonError('This payout is on hold. Release hold before marking paid.', 409)
  }

  if (action === 'set_hold') {
    holdSet.add(payoutId)
    await saveConfigs()
    await logAdminAction({
      action: 'admin.payouts.hold',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'coach_payout',
      targetId: payoutId,
      metadata: { from_status: currentStatus },
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'release_hold') {
    holdSet.delete(payoutId)
    await saveConfigs()
    await logAdminAction({
      action: 'admin.payouts.release_hold',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'coach_payout',
      targetId: payoutId,
      metadata: { from_status: currentStatus },
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reject_pending') {
    removePendingForPayout()
    await saveConfigs()
    await logAdminAction({
      action: 'admin.payouts.pending_rejected',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'coach_payout',
      targetId: payoutId,
      metadata: { from_status: currentStatus },
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'set_failure_reason') {
    if (!note) return jsonError('Failure reason is required')
    failureReasons[payoutId] = note
    await saveConfigs()
    await logAdminAction({
      action: 'admin.payouts.failure_reason_update',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'coach_payout',
      targetId: payoutId,
      metadata: { reason: note },
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'mark_paid' || action === 'approve_pending') {
    const dualApprovalEnabled = Boolean(securityConfig.dual_approval_payouts)
    let eligibleApproverCount = 0

    if (dualApprovalEnabled) {
      const { data: usersPayload } = await supabaseAdmin.auth.admin.listUsers()
      const eligibleApprovers = (usersPayload?.users || []).filter((user) => {
        const metadata = (user.user_metadata || {}) as Record<string, any>
        const nextRole = String(metadata.role || '').toLowerCase()
        const nextTeamRole = normalizeAdminTeamRole(metadata.admin_team_role)
        const suspended = Boolean(metadata.suspended)
        const canApproveRole = nextRole === 'admin' || nextRole === 'superadmin'
        const canApproveTeam = nextTeamRole === 'finance' || nextTeamRole === 'superadmin'
        return canApproveRole && canApproveTeam && !suspended
      })
      eligibleApproverCount = eligibleApprovers.length
    }

    if (dualApprovalEnabled && eligibleApproverCount > 1) {
      const existingIndex = pendingApprovals.findIndex((entry) =>
        String(entry?.payout_id || '') === payoutId
        && String(entry?.status || '').toLowerCase() === 'paid',
      )

      if (existingIndex < 0) {
        pendingApprovals = [
          ...pendingApprovals,
          {
            payout_id: payoutId,
            status: 'paid',
            requested_by: session.user.id,
            requested_at: new Date().toISOString(),
          },
        ]
        await saveConfigs()
        await logAdminAction({
          action: 'admin.payouts.approval_requested',
          actorId: session.user.id,
          actorEmail: session.user.email || null,
          targetType: 'coach_payout',
          targetId: payoutId,
          metadata: { status: 'paid' },
        })
        return NextResponse.json(
          {
            requires_second_approval: true,
            message:
              'Payout marked for second approval. A different finance/superadmin user must confirm it.',
          },
          { status: 202 },
        )
      }

      const existing = pendingApprovals[existingIndex]
      if (String(existing?.requested_by || '') === session.user.id) {
        return jsonError('A second approver is required for this payout.', 409)
      }

      removePendingForPayout()
    } else if (dualApprovalEnabled) {
      await logAdminAction({
        action: 'admin.payouts.dual_approval_bypassed_single_approver',
        actorId: session.user.id,
        actorEmail: session.user.email || null,
        targetType: 'coach_payout',
        targetId: payoutId,
        metadata: {
          eligible_approvers: eligibleApproverCount,
        },
      })
    }

    delete failureReasons[payoutId]
    holdSet.delete(payoutId)

    const { data, error: updateError } = await supabaseAdmin
      .from('coach_payouts')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', payoutId)
      .select('id, amount, status, coach_id, session_payment_id, created_at, paid_at, scheduled_for, updated_at')
      .single()

    if (updateError) {
      return jsonError(updateError.message)
    }

    await saveConfigs()

    await logAdminAction({
      action: 'admin.payouts.update',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'coach_payout',
      targetId: payoutId,
      metadata: { status: 'paid', from_status: currentStatus },
    })

    return NextResponse.json({ payout: data })
  }

  if (action === 'mark_failed') {
    removePendingForPayout()
    failureReasons[payoutId] = note || failureReasons[payoutId] || 'Marked failed by admin.'

    const { data, error: updateError } = await supabaseAdmin
      .from('coach_payouts')
      .update({
        status: 'failed',
        paid_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payoutId)
      .select('id, amount, status, coach_id, session_payment_id, created_at, paid_at, scheduled_for, updated_at')
      .single()

    if (updateError) {
      return jsonError(updateError.message)
    }

    await saveConfigs()

    await logAdminAction({
      action: 'admin.payouts.update',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'coach_payout',
      targetId: payoutId,
      metadata: { status: 'failed', from_status: currentStatus, reason: failureReasons[payoutId] },
    })

    return NextResponse.json({ payout: data })
  }

  if (action === 'retry') {
    removePendingForPayout()
    delete failureReasons[payoutId]

    const updates: Record<string, any> = {
      status: 'scheduled',
      paid_at: null,
      updated_at: new Date().toISOString(),
    }
    if (!payout.scheduled_for) {
      updates.scheduled_for = new Date().toISOString()
    }

    const { data, error: updateError } = await supabaseAdmin
      .from('coach_payouts')
      .update(updates)
      .eq('id', payoutId)
      .select('id, amount, status, coach_id, session_payment_id, created_at, paid_at, scheduled_for, updated_at')
      .single()

    if (updateError) {
      return jsonError(updateError.message)
    }

    await saveConfigs()

    await logAdminAction({
      action: 'admin.payouts.retry',
      actorId: session.user.id,
      actorEmail: session.user.email || null,
      targetType: 'coach_payout',
      targetId: payoutId,
      metadata: { from_status: currentStatus },
    })

    return NextResponse.json({ payout: data })
  }

  return jsonError('Unsupported payout action')
}
