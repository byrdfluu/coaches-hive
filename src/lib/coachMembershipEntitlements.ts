import { supabaseAdmin } from '@/lib/supabaseAdmin'

const ACTIVE_MEMBERSHIP_STATUSES = ['active', 'trialing']

type EntitlementRow = {
  id: string
  subscription_id: string
  coach_id: string
  athlete_id: string
  quantity: number
  used_quantity: number
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
}: {
  coachId: string
  athleteId: string
}) => {
  const [{ data: memberOnlyPlans }, { data: subscriptions }] = await Promise.all([
    supabaseAdmin
      .from('coach_membership_plans')
      .select('id')
      .eq('coach_id', coachId)
      .eq('status', 'active')
      .limit(1),
    supabaseAdmin
      .from('coach_membership_subscriptions')
      .select('id, status, current_period_start, current_period_end')
      .eq('coach_id', coachId)
      .eq('athlete_id', athleteId)
      .in('status', ACTIVE_MEMBERSHIP_STATUSES),
  ])

  const now = new Date()
  const activeSubscriptions = (subscriptions || []).filter((subscription) => {
    const periodStart = toDate(subscription.current_period_start)
    const periodEnd = toDate(subscription.current_period_end)
    if (!periodStart || !periodEnd) return false
    return periodStart <= now && periodEnd >= now
  })

  if (activeSubscriptions.length === 0) {
    return {
      hasMemberOnlyPlans: Boolean(memberOnlyPlans?.length),
      activeSubscriptionCount: 0,
      sessionsRemaining: 0,
      entitlement: null as EntitlementRow | null,
    }
  }

  const subscriptionIds = activeSubscriptions.map((subscription) => subscription.id)

  // Fetch lifetime entitlements — no period filter, sessions accumulate across the program
  const { data: entitlements } = await supabaseAdmin
    .from('coach_membership_entitlements')
    .select('id, subscription_id, coach_id, athlete_id, quantity, used_quantity')
    .in('subscription_id', subscriptionIds)
    .eq('entitlement_type', 'session_credit')
    .order('created_at', { ascending: false })

  const creditRows = ((entitlements || []) as EntitlementRow[])
    .map((entitlement) => ({
      ...entitlement,
      quantity: Number(entitlement.quantity || 0),
      used_quantity: Number(entitlement.used_quantity || 0),
    }))
    .filter((entitlement) => entitlement.quantity - entitlement.used_quantity > 0)

  const sessionsRemaining = creditRows.reduce(
    (total, entitlement) => total + Math.max(0, entitlement.quantity - entitlement.used_quantity),
    0,
  )

  return {
    hasMemberOnlyPlans: Boolean(memberOnlyPlans?.length),
    activeSubscriptionCount: activeSubscriptions.length,
    sessionsRemaining,
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
      return { ok: false, error: 'No sessions remaining.' }
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

  return { ok: false, error: 'Session was already consumed. Try again.' }
}

export const addSessionsToEnrollment = async ({
  coachId,
  athleteId,
  sessionsToAdd,
}: {
  coachId: string
  athleteId: string
  sessionsToAdd: number
}) => {
  const { data: entitlements } = await supabaseAdmin
    .from('coach_membership_entitlements')
    .select('id, subscription_id, quantity, used_quantity')
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .eq('entitlement_type', 'session_credit')
    .order('created_at', { ascending: false })
    .limit(1)

  const entitlement = (entitlements || [])[0]
  if (!entitlement) {
    return { ok: false, error: 'No enrollment found for this athlete.' }
  }

  const newQuantity = Number(entitlement.quantity || 0) + sessionsToAdd
  const { error: updateError } = await supabaseAdmin
    .from('coach_membership_entitlements')
    .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
    .eq('id', entitlement.id)

  if (updateError) return { ok: false, error: updateError.message }

  const sessionsTotal = newQuantity
  const sessionsRemaining = Math.max(0, newQuantity - Number(entitlement.used_quantity || 0))
  return { ok: true, sessions_total: sessionsTotal, sessions_remaining: sessionsRemaining }
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
        notes: `Session returned after cancellation by ${canceledByRole || 'unknown'}.`,
      })
  }

  return { returned: true }
}
