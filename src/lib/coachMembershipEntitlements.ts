import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ACTIVE_MEMBERSHIP_STATUSES = ['active', 'trialing']

type CreditEntitlementRow = {
  id: string
  subscription_id: string
  coach_id: string
  athlete_id: string
  quantity: number
  used_quantity: number
  period_start: string
  period_end: string
}

type UsageRow = {
  id: string
  entitlement_id: string
  subscription_id: string
  coach_id: string
  athlete_id: string
  quantity: number
}

const toDate = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const parseCancelWindowHours = (value?: string | null) => {
  const normalized = String(value || '').toLowerCase()
  const amount = Number.parseFloat(normalized)
  if (!Number.isFinite(amount)) return 24
  if (normalized.includes('day')) return amount * 24
  if (normalized.includes('week')) return amount * 24 * 7
  if (normalized.includes('minute')) return amount / 60
  return amount
}

export const getCoachMembershipBookingState = async ({
  coachId,
  athleteId,
  at = new Date(),
}: {
  coachId: string
  athleteId: string
  at?: Date
}) => {
  const nowIso = at.toISOString()

  const [{ data: memberOnlyPlans }, { data: subscriptions }] = await Promise.all([
    supabaseAdmin
      .from('coach_membership_plans')
      .select('id')
      .eq('coach_id', coachId)
      .eq('status', 'active')
      .eq('member_only_access', true)
      .limit(1),
    supabaseAdmin
      .from('coach_membership_subscriptions')
      .select('id, status, current_period_start, current_period_end')
      .eq('coach_id', coachId)
      .eq('athlete_id', athleteId)
      .in('status', ACTIVE_MEMBERSHIP_STATUSES),
  ])

  const activeSubscriptions = (subscriptions || []).filter((subscription) => {
    const periodStart = toDate(subscription.current_period_start)
    const periodEnd = toDate(subscription.current_period_end)
    if (!periodStart || !periodEnd) return false
    return periodStart <= at && periodEnd >= at
  })

  if (activeSubscriptions.length === 0) {
    return {
      hasMemberOnlyPlans: Boolean(memberOnlyPlans?.length),
      activeSubscriptionCount: 0,
      availableCredits: 0,
      entitlement: null as CreditEntitlementRow | null,
    }
  }

  const subscriptionIds = activeSubscriptions.map((subscription) => subscription.id)
  const { data: entitlements } = await supabaseAdmin
    .from('coach_membership_entitlements')
    .select('id, subscription_id, coach_id, athlete_id, quantity, used_quantity, period_start, period_end')
    .in('subscription_id', subscriptionIds)
    .eq('entitlement_type', 'session_credit')
    .lte('period_start', nowIso)
    .gte('period_end', nowIso)
    .order('period_end', { ascending: true })

  const creditRows = ((entitlements || []) as CreditEntitlementRow[])
    .map((entitlement) => ({
      ...entitlement,
      quantity: Number(entitlement.quantity || 0),
      used_quantity: Number(entitlement.used_quantity || 0),
    }))
    .filter((entitlement) => entitlement.quantity - entitlement.used_quantity > 0)

  const availableCredits = creditRows.reduce(
    (total, entitlement) => total + Math.max(0, entitlement.quantity - entitlement.used_quantity),
    0,
  )

  return {
    hasMemberOnlyPlans: Boolean(memberOnlyPlans?.length),
    activeSubscriptionCount: activeSubscriptions.length,
    availableCredits,
    entitlement: creditRows[0] || null,
  }
}

export const consumeCoachMembershipCredit = async ({
  coachId,
  athleteId,
  sessionId,
  notes,
}: {
  coachId: string
  athleteId: string
  sessionId: string
  notes?: string | null
}) => {
  const { data: existingUsage } = await supabaseAdmin
    .from('coach_membership_usage')
    .select('id')
    .eq('session_id', sessionId)
    .eq('usage_type', 'session_credit')
    .maybeSingle()

  if (existingUsage?.id) {
    return { ok: true, alreadyConsumed: true }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const state = await getCoachMembershipBookingState({ coachId, athleteId })
    const entitlement = state.entitlement
    if (!entitlement) {
      return { ok: false, error: 'No membership credits available.' }
    }

    const usedQuantity = Number(entitlement.used_quantity || 0)
    const nextUsedQuantity = usedQuantity + 1
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('coach_membership_entitlements')
      .update({
        used_quantity: nextUsedQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entitlement.id)
      .eq('used_quantity', usedQuantity)
      .select('id')
      .maybeSingle()

    if (updateError || !updated?.id) continue

    const { error: usageError } = await supabaseAdmin
      .from('coach_membership_usage')
      .insert({
        entitlement_id: entitlement.id,
        subscription_id: entitlement.subscription_id,
        coach_id: coachId,
        athlete_id: athleteId,
        session_id: sessionId,
        usage_type: 'session_credit',
        quantity: 1,
        notes: notes || null,
      })

    if (usageError) {
      await supabaseAdmin
        .from('coach_membership_entitlements')
        .update({
          used_quantity: usedQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entitlement.id)
      return { ok: false, error: usageError.message }
    }

    return { ok: true, entitlementId: entitlement.id }
  }

  return { ok: false, error: 'Membership credit was already used. Try again.' }
}

export const canReturnCoachMembershipCredit = async ({
  coachId,
  sessionStart,
  canceledByRole,
}: {
  coachId: string
  sessionStart?: string | null
  canceledByRole?: string | null
}) => {
  if (canceledByRole === 'coach' || canceledByRole === 'admin') return true

  const start = toDate(sessionStart)
  if (!start) return false

  const { data: coachProfile } = await supabaseAdmin
    .from('profiles')
    .select('coach_cancel_window')
    .eq('id', coachId)
    .maybeSingle()

  const cancelWindowHours = parseCancelWindowHours(coachProfile?.coach_cancel_window)
  const cutoff = new Date(start.getTime() - cancelWindowHours * 60 * 60 * 1000)
  return new Date() <= cutoff
}

export const returnCoachMembershipCreditForSession = async ({
  sessionId,
  canceledByRole,
  sessionStart,
  coachId,
}: {
  sessionId: string
  canceledByRole?: string | null
  sessionStart?: string | null
  coachId: string
}) => {
  const canReturn = await canReturnCoachMembershipCredit({ coachId, sessionStart, canceledByRole })
  if (!canReturn) return { returned: false, reason: 'outside_cancel_window' }

  const { data: existingRefund } = await supabaseAdmin
    .from('coach_membership_usage')
    .select('id')
    .eq('session_id', sessionId)
    .eq('usage_type', 'refund_credit')
    .maybeSingle()

  if (existingRefund?.id) return { returned: false, reason: 'already_returned' }

  const { data: usageRows } = await supabaseAdmin
    .from('coach_membership_usage')
    .select('id, entitlement_id, subscription_id, coach_id, athlete_id, quantity')
    .eq('session_id', sessionId)
    .eq('usage_type', 'session_credit')

  const usages = (usageRows || []) as UsageRow[]
  if (usages.length === 0) return { returned: false, reason: 'no_credit_usage' }

  for (const usage of usages) {
    const { data: entitlement } = await supabaseAdmin
      .from('coach_membership_entitlements')
      .select('id, used_quantity')
      .eq('id', usage.entitlement_id)
      .maybeSingle()

    const usedQuantity = Math.max(0, Number(entitlement?.used_quantity || 0) - Number(usage.quantity || 1))
    await supabaseAdmin
      .from('coach_membership_entitlements')
      .update({
        used_quantity: usedQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', usage.entitlement_id)

    await supabaseAdmin
      .from('coach_membership_usage')
      .insert({
        entitlement_id: usage.entitlement_id,
        subscription_id: usage.subscription_id,
        coach_id: usage.coach_id,
        athlete_id: usage.athlete_id,
        session_id: sessionId,
        usage_type: 'refund_credit',
        quantity: usage.quantity || 1,
        notes: `Credit returned after cancellation by ${canceledByRole || 'unknown'}.`,
      })
  }

  return { returned: true }
}
