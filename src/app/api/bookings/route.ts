import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'
import { getFeePercentage, type FeeTier } from '@/lib/platformFees'
import { getNextCoachPayoutDate } from '@/lib/coachPayoutRules'
import { sendBookingConfirmationEmail, sendPaymentReceiptEmail } from '@/lib/email'
import { isEmailEnabled, isPushEnabled } from '@/lib/notificationPrefs'
import { parseCurrencyToCents, resolveSessionRateCents, type SessionRates } from '@/lib/sessionPricing'
import { checkGuardianApproval, guardianApprovalBlockedResponse } from '@/lib/guardianApproval'
import { isSchoolOrg } from '@/lib/orgPricing'
import { syncGoogleCalendar, syncZoomMeeting } from '@/lib/calendarSync'
import { trackServerFlowEvent, trackServerFlowFailure } from '@/lib/serverFlowTelemetry'
import { trackMixpanelServerEvent } from '@/lib/mixpanelServer'
export const dynamic = 'force-dynamic'

const ORG_ROLES = new Set(['org_admin', 'school_admin', 'athletic_director', 'program_director', 'club_admin', 'travel_admin'])


const toMinutes = (time: string) => {
  const [hour, minute] = time.split(':').map((value) => Number.parseInt(value, 10))
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null
  return hour * 60 + minute
}

const getSessionEnd = (session: { start_time?: string | null; end_time?: string | null; duration_minutes?: number | null }, fallbackDuration: number) => {
  if (!session.start_time) return null
  const start = new Date(session.start_time)
  if (Number.isNaN(start.getTime())) return null
  if (session.end_time) {
    const end = new Date(session.end_time)
    return Number.isNaN(end.getTime()) ? null : end
  }
  const duration = session.duration_minutes || fallbackDuration
  return new Date(start.getTime() + duration * 60 * 1000)
}

const toAmountFromCents = (cents: number) => Math.round(cents) / 100

async function ensureDirectMessageThread(params: {
  coachId: string
  athleteId: string
  coachName?: string | null
  athleteName?: string | null
  createdBy: string
}) {
  const participantIds = [params.coachId, params.athleteId]

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id, user_id')
    .in('user_id', participantIds)

  if (membershipError) return null

  const threadMemberships = new Map<string, Set<string>>()
  ;(memberships || []).forEach((row) => {
    const current = threadMemberships.get(row.thread_id) || new Set<string>()
    current.add(row.user_id)
    threadMemberships.set(row.thread_id, current)
  })

  const candidateThreadIds = Array.from(threadMemberships.entries())
    .filter(([, userIds]) => participantIds.every((id) => userIds.has(id)))
    .map(([threadId]) => threadId)

  if (candidateThreadIds.length > 0) {
    const { data: existingThreads } = await supabaseAdmin
      .from('threads')
      .select('id, is_group, created_at')
      .in('id', candidateThreadIds)
      .eq('is_group', false)
      .order('created_at', { ascending: false })
      .limit(1)

    if (existingThreads?.[0]?.id) {
      return existingThreads[0].id
    }
  }

  const title = `${params.coachName || 'Coach'} & ${params.athleteName || 'Athlete'}`
  const { data: thread, error: threadError } = await supabaseAdmin
    .from('threads')
    .insert({
      title,
      is_group: false,
      created_by: params.createdBy,
    })
    .select('id')
    .single()

  if (threadError || !thread) return null

  const { error: participantError } = await supabaseAdmin
    .from('thread_participants')
    .insert(participantIds.map((userId) => ({ thread_id: thread.id, user_id: userId })))

  if (participantError) return null

  return thread.id
}

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole([
    'coach', 'athlete', 'admin',
    'org_admin', 'school_admin', 'athletic_director',
    'program_director', 'club_admin', 'travel_admin',
  ])
  if (error || !session) return error

  const isOrgAdminBooking = ORG_ROLES.has(role || '')

  const body = await request.json().catch(() => ({}))
  const {
    coach_id,
    athlete_id,
    sub_profile_id,
    start_time,
    end_time,
    duration_minutes,
    status = 'Scheduled',
    location,
    notes,
    price,
    price_cents,
    session_type,
    title,
    type,
    external_provider,
    external_event_id,
    external_calendar_id,
    sync_status,
    meeting_mode,
    meeting_provider,
    meeting_link,
    practice_plan_id,
    payment_intent_id,
  } = body || {}

  const coachId = typeof coach_id === 'string' ? coach_id.trim() : ''
  let athleteId = typeof athlete_id === 'string' ? athlete_id.trim() : ''
  const normalizedSessionType = String(session_type || type || '').toLowerCase()
  const isTaskOrReminder = normalizedSessionType.includes('task') || normalizedSessionType.includes('reminder')
  const canSaveWithoutAthlete = isTaskOrReminder || isOrgAdminBooking || role === 'admin'

  if (!coachId || !start_time) {
    trackServerFlowEvent({
      flow: 'booking_create',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role,
      metadata: { reason: 'missing_coach_or_start_time' },
    })
    return jsonError('coach_id and start_time are required')
  }

  if (role === 'athlete' && !athleteId) {
    athleteId = session.user.id
  }

  if (!athleteId && !canSaveWithoutAthlete) {
    trackServerFlowEvent({
      flow: 'booking_create',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role,
      entityId: coachId,
      metadata: { reason: 'missing_athlete_id' },
    })
    return jsonError('athlete_id is required for training sessions')
  }

  if (role === 'coach' && coachId !== session.user.id) {
    trackServerFlowEvent({
      flow: 'booking_create',
      step: 'authz',
      status: 'failed',
      userId: session.user.id,
      role,
      entityId: coachId,
      metadata: { reason: 'coach_cannot_book_for_other_coach' },
    })
    return jsonError('Coach role can only create sessions for themselves', 403)
  }

  if (role === 'athlete' && athleteId !== session.user.id) {
    trackServerFlowEvent({
      flow: 'booking_create',
      step: 'authz',
      status: 'failed',
      userId: session.user.id,
      role,
      entityId: athleteId,
      metadata: { reason: 'athlete_cannot_book_for_other_athlete' },
    })
    return jsonError('Athlete role can only create their own sessions', 403)
  }

  // Validate sub_profile_id belongs to the current user
  const resolvedSubProfileId = typeof sub_profile_id === 'string' ? sub_profile_id.trim() || null : null
  if (resolvedSubProfileId && role === 'athlete') {
    const { data: subProfile } = await supabaseAdmin
      .from('athlete_sub_profiles')
      .select('id')
      .eq('id', resolvedSubProfileId)
      .eq('user_id', session.user.id)
      .maybeSingle()
    if (!subProfile) return jsonError('Sub-profile not found', 404)
  }

  if (role === 'athlete' && coachId) {
    const guardianCheck = await checkGuardianApproval({
      athleteId: session.user.id,
      targetType: 'coach',
      targetId: coachId,
      scope: 'transactions',
    })
    if (!guardianCheck.allowed) {
      return guardianApprovalBlockedResponse({
        scope: 'transactions',
        targetType: 'coach',
        targetId: coachId,
        pending: guardianCheck.pending,
        approvalId: guardianCheck.approvalId,
      })
    }

    const { data: coachProfile } = await supabaseAdmin
      .from('profiles')
      .select('coach_privacy_settings')
      .eq('id', coachId)
      .maybeSingle()

    const privacy = (coachProfile?.coach_privacy_settings || {}) as {
      visibleToAthletes?: boolean
      blockedAthletes?: string
    }

    if (privacy.visibleToAthletes === false) {
      return jsonError('Coach is not accepting athlete bookings right now.', 403)
    }

    if (privacy.blockedAthletes) {
      const blockedList = privacy.blockedAthletes
        .split(/[\n,]+/)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
      const athleteEmail = session.user.email?.toLowerCase()
      const athleteId = session.user.id.toLowerCase()
      const isBlocked =
        blockedList.includes(athleteId) || (athleteEmail ? blockedList.includes(athleteEmail) : false)
      if (isBlocked) {
        return jsonError('Coach is not accepting bookings from this athlete.', 403)
      }
    }
  }

  const start = new Date(start_time)
  if (Number.isNaN(start.getTime())) {
    return jsonError('Invalid start_time')
  }

  const duration = Number.isFinite(Number(duration_minutes)) ? Number(duration_minutes) : 60
  if (!Number.isFinite(duration) || duration <= 0) {
    return jsonError('duration_minutes must be greater than 0')
  }
  const end = end_time ? new Date(end_time) : new Date(start.getTime() + duration * 60 * 1000)
  if (Number.isNaN(end.getTime())) {
    return jsonError('Invalid end_time')
  }
  if (end.getTime() <= start.getTime()) {
    return jsonError('end_time must be after start_time')
  }

  const meetingMode = meeting_mode === 'online' ? 'online' : 'in_person'
  const meetingProvider = typeof meeting_provider === 'string' ? meeting_provider : null
  const meetingLink = typeof meeting_link === 'string' ? meeting_link.trim() : ''
  const allowedProviders = ['google_meet', 'zoom', 'custom']
  if (meetingProvider && !allowedProviders.includes(meetingProvider)) {
    return jsonError('Invalid meeting provider selected.')
  }

  if (meetingMode === 'online') {
    if (!meetingProvider) {
      return jsonError('Select a video provider for online sessions.')
    }
    if (meetingProvider === 'custom' && !meetingLink) {
      return jsonError('Add a meeting link for online sessions.')
    }
    if ((meetingProvider === 'google_meet' || meetingProvider === 'zoom') && coachId) {
      const providerKey = meetingProvider === 'google_meet' ? 'google' : 'zoom'
      const { data: integrationRow } = await supabaseAdmin
        .from('user_integrations')
        .select('provider')
        .eq('user_id', coachId)
        .eq('provider', providerKey)
        .maybeSingle()
      if (!integrationRow) {
        return jsonError(`Coach has not connected ${meetingProvider === 'google_meet' ? 'Google Meet' : 'Zoom'}.`, 409)
      }
    }
  }

  const windowStart = new Date(start.getTime() - duration * 60 * 1000)
  const windowEnd = new Date(end.getTime() + duration * 60 * 1000)

  const { data: existingSessions, error: conflictError } = await supabaseAdmin
    .from('sessions')
    .select('id, coach_id, athlete_id, start_time, end_time, duration_minutes')
    .or(athleteId ? `coach_id.eq.${coachId},athlete_id.eq.${athleteId}` : `coach_id.eq.${coachId}`)
    .gte('start_time', windowStart.toISOString())
    .lte('start_time', windowEnd.toISOString())

  if (conflictError) {
    return jsonError('Could not check booking conflicts', 500)
  }

  const hasConflict = (existingSessions || []).some((session) => {
    const existingStart = session.start_time ? new Date(session.start_time) : null
    const existingEnd = getSessionEnd(session, duration)
    if (!existingStart || Number.isNaN(existingStart.getTime()) || !existingEnd) return false
    return start < existingEnd && end > existingStart
  })

  if (hasConflict) {
    return jsonError('Session conflicts with an existing booking', 409)
  }

  const { data: availabilityRows } = await supabaseAdmin
    .from('availability_blocks')
    .select('day_of_week, start_time, end_time, session_type')
    .eq('coach_id', coachId)

  // Athletes pick from pre-validated slots on the coach profile — re-checking here causes false
  // failures due to server-side UTC vs. coach local-timezone mismatch in availability blocks.
  const skipAvailability = role === 'athlete'
    || (typeof session_type === 'string' && (session_type.includes('task') || session_type.includes('reminder')))

  if (availabilityRows && availabilityRows.length > 0 && !skipAvailability) {
    const dayOfWeek = start.getDay()
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const endMinutes = end.getHours() * 60 + end.getMinutes()

    const withinAvailability = availabilityRows.some((slot) => {
      if (slot.day_of_week !== dayOfWeek) return false
      if (!slot.start_time || !slot.end_time) return false
      const slotStart = toMinutes(slot.start_time)
      const slotEnd = toMinutes(slot.end_time)
      if (slotStart === null || slotEnd === null) return false
      const matchesType = !slot.session_type || !session_type || session_type.includes('training') || slot.session_type === session_type
      return matchesType && startMinutes >= slotStart && endMinutes <= slotEnd
    })

    if (!withinAvailability) {
      return jsonError('Session falls outside coach availability', 409)
    }
  }

  const providerLabel = meetingProvider === 'google_meet' ? 'Google Meet' : meetingProvider === 'zoom' ? 'Zoom' : 'Online'
  const resolvedLocation = meetingMode === 'online'
    ? (meetingProvider === 'custom'
      ? meetingLink
      : meetingLink || location || `${providerLabel} link pending`)
    : location

  let orgId: string | null = null
  let orgType: string | null = null
  if (coachId) {
    const { data: membership } = await supabaseAdmin
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', coachId)
      .maybeSingle()
    orgId = membership?.org_id || null
  }
  if (orgId) {
    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('org_type')
      .eq('id', orgId)
      .maybeSingle()
    orgType = orgRow?.org_type || null
  }

  const { data: coachBillingProfile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_account_id, coach_profile_settings')
    .eq('id', coachId)
    .maybeSingle()

  const { data: planRow } = await supabaseAdmin
    .from('coach_plans')
    .select('tier')
    .eq('coach_id', coachId)
    .maybeSingle()

  const { data: feeRuleRows } = await supabaseAdmin
    .from('platform_fee_rules')
    .select('tier, category, percentage')
    .eq('active', true)

  const tier = (planRow?.tier as FeeTier) || 'starter'
  const percent = getFeePercentage(tier, 'session', feeRuleRows || [])
  const sessionRateCents = resolveSessionRateCents({
    rates: (coachBillingProfile?.coach_profile_settings as { rates?: SessionRates } | null)?.rates || null,
    sessionType: session_type,
    meetingMode: meetingMode,
  })
  const requestedCents = price_cents ? Number(price_cents) : parseCurrencyToCents(price)
  let chargeAmountCents = sessionRateCents > 0 ? sessionRateCents : Math.max(0, Math.round(requestedCents || 0))
  const paymentIntentId = typeof payment_intent_id === 'string' && payment_intent_id.trim()
    ? payment_intent_id.trim()
    : null

  // Org admin bookings and school-org athlete bookings are always free at the platform level.
  // Org admins schedule sessions on behalf of their org (no athlete PI needed).
  // School orgs sponsor all athlete sessions — athletes pay the school outside the platform.
  const schoolSession = isOrgAdminBooking || isSchoolOrg(orgType)
  if (schoolSession) {
    // Force zero-amount for org-admin / school sessions
    chargeAmountCents = 0
  }

  if (!athleteId && chargeAmountCents > 0) {
    return jsonError('Paid sessions require a tagged athlete.', 400)
  }

  if (role === 'athlete' && chargeAmountCents > 0 && !paymentIntentId && !schoolSession) {
    return jsonError('Payment is required before booking this session.', 402)
  }

  let paymentMethod: 'manual' | 'stripe' | 'org_admin' = 'manual'
  if (schoolSession) paymentMethod = 'org_admin'
  let stripePaymentIntentId: string | null = null
  let platformFeeCents = Math.round(chargeAmountCents * (percent / 100))

  if (paymentIntentId && !schoolSession) {
    const { data: existingReceipt } = await supabaseAdmin
      .from('payment_receipts')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle()

    if (existingReceipt?.id) {
      return jsonError('This payment intent has already been used for a booking.', 409)
    }

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (intent.status !== 'succeeded') {
      return jsonError('Payment has not completed yet.', 409)
    }

    if (intent.currency !== 'usd') {
      return jsonError('Payment currency must be USD for session bookings.', 400)
    }

    if (intent.amount !== chargeAmountCents) {
      return jsonError('Payment amount does not match the session rate.', 409)
    }

    const intentCoachId = String(intent.metadata?.coachId || '')
    const intentAthleteId = String(intent.metadata?.athleteId || '')
    if (intentCoachId && intentCoachId !== coachId) {
      return jsonError('Payment intent coach does not match booking coach.', 403)
    }
    if (intentAthleteId && intentAthleteId !== athleteId) {
      return jsonError('Payment intent athlete does not match booking athlete.', 403)
    }

    if (!coachBillingProfile?.stripe_account_id) {
      return jsonError('Coach must connect Stripe before accepting paid bookings.', 400)
    }

    const destination = intent.transfer_data?.destination
    if (destination && destination !== coachBillingProfile.stripe_account_id) {
      return jsonError('Payment destination does not match coach payout account.', 409)
    }

    const expectedFeeCents = Math.round(chargeAmountCents * (percent / 100))
    if (typeof intent.application_fee_amount === 'number') {
      if (Math.abs(intent.application_fee_amount - expectedFeeCents) > 1) {
        return jsonError('Platform fee percent does not match configured scheduling fee.', 409)
      }
      platformFeeCents = intent.application_fee_amount
    } else {
      platformFeeCents = expectedFeeCents
    }

    paymentMethod = 'stripe'
    stripePaymentIntentId = intent.id
  }

  const amount = toAmountFromCents(chargeAmountCents)
  const platformFee = toAmountFromCents(platformFeeCents)
  const netAmount = Math.max(toAmountFromCents(chargeAmountCents - platformFeeCents), 0)
  const nowIso = new Date().toISOString()

  trackServerFlowEvent({
    flow: 'booking_create',
    step: 'write',
    status: 'started',
    userId: session.user.id,
    role,
    entityId: coachId,
    metadata: {
      athleteId: athleteId || null,
      sessionType: session_type || null,
      amount,
      paymentMethod,
      meetingMode,
    },
  })

  const insertData: Record<string, unknown> = {
    coach_id: coachId,
    athlete_id: athleteId || null,
    sub_profile_id: resolvedSubProfileId || null,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    duration_minutes: duration,
    status: String(status || 'scheduled').toLowerCase(),
    location: resolvedLocation,
    notes,
    price: amount,
    price_cents: chargeAmountCents,
    session_type,
    title,
    type,
  }

  if (typeof practice_plan_id === 'string' && practice_plan_id) {
    insertData.practice_plan_id = practice_plan_id
  }

  const resolvedExternalProvider = meetingMode === 'online' && meetingProvider
    ? meetingProvider
    : external_provider
  const resolvedSyncStatus = meetingMode === 'online'
    && (meetingProvider === 'google_meet' || meetingProvider === 'zoom')
    && !meetingLink
    ? 'pending'
    : sync_status

  if (resolvedExternalProvider) insertData.external_provider = resolvedExternalProvider
  if (external_event_id) insertData.external_event_id = external_event_id
  if (external_calendar_id) insertData.external_calendar_id = external_calendar_id
  if (resolvedSyncStatus) insertData.sync_status = resolvedSyncStatus

  const { data, error: insertError } = await supabaseAdmin
    .from('sessions')
    .insert(insertData)
    .select('*')
    .single()

  if (insertError) {
    trackServerFlowFailure(insertError, {
      flow: 'booking_create',
      step: 'session_insert',
      userId: session.user.id,
      role,
      entityId: coachId,
      metadata: {
        athleteId: athleteId || null,
        sessionType: session_type || null,
        amount,
      },
    })
    return jsonError(insertError.message)
  }

  if (athleteId) {
    await supabaseAdmin
      .from('coach_athlete_links')
      .upsert({
        coach_id: coachId,
        athlete_id: athleteId,
        status: 'active',
      }, { onConflict: 'coach_id,athlete_id' })
  }

  const profileIds = [coachId, athleteId].filter(Boolean) as string[]
  let profileRows: Array<Record<string, any>> = []
  if (profileIds.length) {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, notification_prefs')
      .in('id', profileIds)
    profileRows = (data || []) as Array<Record<string, any>>
  }

  const profileMap = new Map((profileRows || []).map((row: any) => [row.id, row]))
  const coachProfile = profileMap.get(coachId)
  const athleteProfile = athleteId ? profileMap.get(athleteId) : null

  if (athleteId) {
    await ensureDirectMessageThread({
      coachId,
      athleteId,
      coachName: coachProfile?.full_name || null,
      athleteName: athleteProfile?.full_name || null,
      createdBy: session.user.id,
    }).catch(() => null)
  }

  // Auto-sync to Google Calendar or Zoom (best-effort, non-blocking)
  if (meetingMode === 'online' && !meetingLink) {
    if (meetingProvider === 'google_meet') {
      syncGoogleCalendar({
        coachId,
        sessionId: data.id,
        title: data.title || 'Training session',
        startTime: data.start_time,
        endTime: data.end_time,
        location: data.location,
        coachEmail: coachProfile?.email || null,
        athleteEmail: athleteProfile?.email || null,
      }).catch(() => {/* best-effort */})
    } else if (meetingProvider === 'zoom') {
      syncZoomMeeting({
        coachId,
        sessionId: data.id,
        title: data.title || 'Training session',
        startTime: data.start_time,
        durationMinutes: duration,
      }).catch(() => {/* best-effort */})
    }
  }

  if (amount > 0 && athleteId) {
    const { data: paymentRow } = await supabaseAdmin
      .from('session_payments')
      .insert({
        session_id: data.id,
        athlete_id: athleteId,
        coach_id: coachId,
        org_id: orgId,
        amount,
        platform_fee: platformFee,
        net_amount: netAmount,
        currency: 'usd',
        status: 'paid',
        payment_method: paymentMethod,
        paid_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id')
      .maybeSingle()

    if (paymentRow?.id) {
      const { data: receiptRow } = await supabaseAdmin.from('payment_receipts').insert({
        payer_id: athleteId,
        payee_id: coachId,
        org_id: orgId,
        session_payment_id: paymentRow.id,
        amount,
        currency: 'usd',
        status: 'paid',
        stripe_payment_intent_id: stripePaymentIntentId,
        metadata: {
          source: 'session',
          session_id: data.id,
          platform_fee: platformFee,
          platform_fee_rate: percent,
          net_amount: netAmount,
        },
      }).select('id').maybeSingle()
      if (athleteProfile?.email && isEmailEnabled(athleteProfile?.notification_prefs, 'payments')) {
        await sendPaymentReceiptEmail({
          toEmail: athleteProfile.email,
          toName: athleteProfile.full_name,
          amount,
          currency: 'usd',
          receiptId: receiptRow?.id || null,
          description: data.title || 'Training session',
          dashboardUrl: '/athlete/payments',
        })
      }
      const formattedAmount = `$${amount.toFixed(2).replace(/\\.00$/, '')}`
      if (athleteProfile?.id && isPushEnabled(athleteProfile?.notification_prefs, 'payments')) {
        await supabaseAdmin.from('notifications').insert({
          user_id: athleteProfile.id,
          type: 'session_payment',
          title: 'Payment received',
          body: `Payment of ${formattedAmount} for ${data.title || 'your session'} was processed.`,
          action_url: '/athlete/payments',
          data: { session_id: data.id, payment_id: paymentRow.id, category: 'Payments' },
        })
      }
      if (coachProfile?.id && isPushEnabled(coachProfile?.notification_prefs, 'payments')) {
        await supabaseAdmin.from('notifications').insert({
          user_id: coachProfile.id,
          type: 'session_payment',
          title: 'Session payment captured',
          body: `Payment of ${formattedAmount} received for ${data.title || 'a session'}.`,
          action_url: '/coach/revenue',
          data: { session_id: data.id, payment_id: paymentRow.id, category: 'Payments' },
        })
      }

      await trackMixpanelServerEvent({
        event: 'Session Revenue Recorded',
        distinctId: coachId,
        properties: {
          session_id: data.id,
          session_payment_id: paymentRow.id,
          coach_id: coachId,
          athlete_id: athleteId,
          org_id: orgId || null,
          gross_revenue: amount,
          platform_revenue: platformFee,
          platform_net_profit_estimate: platformFee,
          coach_revenue: netAmount,
          payout_amount: netAmount,
          payout_status: netAmount > 0 ? 'scheduled' : 'none',
          currency: 'usd',
        },
      })
    }

    if (paymentRow?.id && netAmount > 0) {
      const { data: coachPlan } = await supabaseAdmin
        .from('coach_plans')
        .select('tier, created_at')
        .eq('coach_id', coachId)
        .maybeSingle()
      const scheduledFor = getNextCoachPayoutDate({
        tier: coachPlan?.tier,
        anchorDate: coachPlan?.created_at,
      }).toISOString()
      await supabaseAdmin
        .from('coach_payouts')
        .insert({
          session_payment_id: paymentRow.id,
          coach_id: coachId,
          amount: netAmount,
          status: 'scheduled',
          scheduled_for: scheduledFor,
          created_at: nowIso,
          updated_at: nowIso,
        })
    }
  }

  if (athleteProfile?.email && isEmailEnabled(athleteProfile?.notification_prefs, 'sessions')) {
    await sendBookingConfirmationEmail({
      toEmail: athleteProfile.email,
      toName: athleteProfile.full_name,
      coachName: coachProfile?.full_name,
      athleteName: athleteProfile.full_name,
      startTime: data.start_time,
      endTime: data.end_time,
      location: data.location,
      sessionType: data.session_type,
      sessionId: data.id,
      recipientType: 'athlete',
      dashboardUrl: '/athlete/calendar',
    })
  }

  if (coachProfile?.email && isEmailEnabled(coachProfile?.notification_prefs, 'sessions')) {
    await sendBookingConfirmationEmail({
      toEmail: coachProfile.email,
      toName: coachProfile.full_name,
      coachName: coachProfile.full_name,
      athleteName: athleteProfile?.full_name,
      startTime: data.start_time,
      endTime: data.end_time,
      location: data.location,
      sessionType: data.session_type,
      sessionId: data.id,
      recipientType: 'coach',
      dashboardUrl: '/coach/calendar',
    })
  }

  const sessionDateLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const sessionTimeLabel = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const sessionLabel = `${sessionDateLabel} at ${sessionTimeLabel}`

  if (coachProfile?.id && isPushEnabled(coachProfile?.notification_prefs, 'sessions')) {
    await supabaseAdmin.from('notifications').insert({
      user_id: coachProfile.id,
      type: 'session_booked',
      title: 'New session booked',
      body: `Session with ${athleteProfile?.full_name || 'an athlete'} on ${sessionLabel}.`,
      action_url: '/coach/calendar',
      data: { session_id: data.id, category: 'Sessions' },
    })
  }

  if (athleteProfile?.id && isPushEnabled(athleteProfile?.notification_prefs, 'sessions')) {
    await supabaseAdmin.from('notifications').insert({
      user_id: athleteProfile.id,
      type: 'session_booked',
      title: 'Session booked',
      body: `Session with ${coachProfile?.full_name || 'your coach'} on ${sessionLabel}.`,
      action_url: '/athlete/calendar',
      data: { session_id: data.id, category: 'Sessions' },
    })
  }

  trackServerFlowEvent({
    flow: 'booking_create',
    step: 'write',
    status: 'succeeded',
    userId: session.user.id,
    role,
    entityId: data.id,
    metadata: {
      coachId,
      athleteId: athleteId || null,
      amount,
      paymentMethod,
      meetingMode,
    },
  })

  await trackMixpanelServerEvent({
    event: 'Session Booked',
    distinctId: session.user.id,
    properties: {
      session_id: data.id,
      coach_id: coachId,
      athlete_id: athleteId || null,
      org_id: orgId || null,
      actor_role: role || null,
      session_type: String(data.session_type || data.type || '').trim() || null,
      title: String(data.title || '').trim() || null,
      start_time: data.start_time || null,
      status: String(data.status || '').trim() || null,
      gross_revenue: amount,
      platform_revenue: platformFee,
      platform_net_profit_estimate: platformFee,
      coach_revenue: netAmount,
      is_paid: amount > 0,
      currency: 'usd',
    },
  })

  return NextResponse.json({ session: data })
}

export async function PATCH(request: Request) {
  const { session, role, error } = await getSessionRole(['coach', 'athlete', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const { id, status, cancel_reason } = body || {}

  if (!id || typeof id !== 'string') return jsonError('Session id is required')
  if (!status || typeof status !== 'string') return jsonError('status is required')

  const allowedStatuses = ['cancelled', 'rescheduled', 'completed']
  if (!allowedStatuses.includes(status)) {
    return jsonError(`Invalid status. Allowed: ${allowedStatuses.join(', ')}`)
  }

  const { data: existing } = await supabaseAdmin
    .from('sessions')
    .select('id, coach_id, athlete_id, status')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return jsonError('Session not found', 404)

  const isCoach = role === 'coach' && existing.coach_id === session.user.id
  const isAthlete = role === 'athlete' && existing.athlete_id === session.user.id
  const isAdmin = role === 'admin'

  if (!isCoach && !isAthlete && !isAdmin) {
    return jsonError('Forbidden', 403)
  }

  const updates: Record<string, unknown> = { status }
  if (cancel_reason && typeof cancel_reason === 'string') {
    updates.cancel_reason = cancel_reason.trim().slice(0, 500)
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('sessions')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (updateError) return jsonError(updateError.message, 500)
  return NextResponse.json({ session: updated })
}
