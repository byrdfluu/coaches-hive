import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { offeringCapacitySnapshot, safeOfferingReservationError } from '@/lib/offeringReservations'

export const dynamic = 'force-dynamic'

const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET(request: Request) {
  const { session, supabase, error } = await getSessionRole(['athlete'])
  if (error || !session) return error

  const requestedProfileId = new URL(request.url).searchParams.get('athlete_profile_id')
    || String(session.user.user_metadata?.selected_athlete_profile_id || '')
  const athlete = await resolveAuthorizedAthleteContext(session.user.id, requestedProfileId)
  if (!athlete) return jsonError('Athlete profile not found or access denied.', 404)

  // Call the same authenticated visibility RPC used by iOS so RLS/auth.uid()
  // remains part of the authorization decision.
  const { data: programs, error: programsError } = await supabase.rpc('assigned_org_programs_for_athlete', {
    p_athlete_id: athlete.profileId,
  })
  if (programsError) return jsonError('Unable to load assigned programs.', 500)

  const programIds = (programs || []).map((program: { id: string }) => program.id)
  const [{ data: registrations }, { data: orgSettings }, { data: creditMemberships }, { data: recurringSubscriptions }] = await Promise.all([
    programIds.length
      ? supabaseAdmin
          .from('program_registrations')
          .select('id,program_id,occurrence_id,status,registered_at')
          .eq('athlete_profile_id', athlete.profileId)
          .in('program_id', programIds)
      : Promise.resolve({ data: [] }),
    programIds.length
      ? supabaseAdmin
          .from('org_settings')
          .select('org_id,org_name')
          .in('org_id', Array.from(new Set((programs || []).map((program: { org_id: string }) => program.org_id))))
      : Promise.resolve({ data: [] }),
    programIds.length
      ? (supabaseAdmin as any)
          .from('org_offering_credit_memberships')
          .select('id,offering_id,status,current_period_start,current_period_end,cancel_at_period_end,created_at')
          .eq('athlete_id', athlete.profileId)
          .in('offering_id', programIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    programIds.length
      ? (supabaseAdmin as any)
          .from('offering_recurring_subscriptions')
          .select('id,offering_id,status,current_period_start,current_period_end,cancel_at_period_end')
          .eq('purchaser_user_id', session.user.id)
          .in('offering_id', programIds)
      : Promise.resolve({ data: [] }),
  ])

  const currentCycles = new Map<string, any>()
  await Promise.all((creditMemberships || []).filter((membership: any) => membership.status === 'active').map(async (membership: any) => {
    const { data, error: cycleError } = await (supabase as any).rpc('org_offering_eligible_credit_cycles', {
      p_membership_id: membership.id,
      p_as_of: new Date().toISOString(),
    })
    if (cycleError) throw cycleError
    if (data?.[0]) currentCycles.set(membership.id, data[0])
  }))

  const registrationIds = (registrations || []).map((registration) => registration.id)
  const { data: selections, error: selectionsError } = registrationIds.length
    ? await (supabaseAdmin as any)
        .from('org_offering_registration_occurrences')
        .select('id,registration_id,occurrence_id,status,credit_returned,cancelled_at,cancellation_reason,created_at')
        .eq('registration_type', 'program')
        .in('registration_id', registrationIds)
        .order('created_at')
    : { data: [], error: null }
  if (selectionsError) return jsonError('Unable to load selected dates.', 500)

  const { data: occurrences } = programIds.length ? await (supabaseAdmin as any).from('org_offering_occurrences').select('id,offering_id,starts_at,ends_at,timezone,location,field_or_court,capacity,status,coach_ids').in('offering_id', programIds).eq('status','published').gt('starts_at',new Date().toISOString()).order('starts_at') : { data: [] }
  const occurrenceIds=(occurrences||[]).map((row:any)=>row.id)
  const capacityByOccurrence=await offeringCapacitySnapshot(occurrenceIds)
  const { data: creditBalances, error: creditBalancesError } = await (supabase as any).rpc('my_credit_balances', {
    p_athlete_id: athlete.profileId,
    p_as_of: new Date().toISOString(),
  })
  if (creditBalancesError) return jsonError('Unable to load credit balances.', 500)
  const registrationMap = new Map((registrations || []).map((registration) => [registration.program_id, registration]))
  const orgMap = new Map((orgSettings || []).map((org) => [org.org_id, org.org_name || 'Organization']))
  const rows = (programs || []).map((program: Record<string, unknown>) => ({
    ...program,
    organization_name: orgMap.get(String(program.org_id)) || 'Organization',
    price_cents: Math.round(Number(program.price || 0) * 100),
    payment_plan_enabled: Boolean(program.payment_plan_enabled),
    payment_plan_installments: program.payment_plan_installments == null ? null : Number(program.payment_plan_installments),
    payment_plan_frequency: program.payment_plan_frequency || null,
    payment_plan_first_payment_cents: program.payment_plan_first_payment_cents == null
      ? null
      : Number(program.payment_plan_first_payment_cents),
    registration: (() => {
      const registration = registrationMap.get(String(program.id))
      if (!registration) return null
      return {
        ...registration,
        occurrence_selections: (selections || []).filter((row: any) => row.registration_id === registration.id),
      }
    })(),
    credit_membership: (() => {
      const membership=(creditMemberships||[]).find((row:any)=>row.offering_id===program.id)
      if(!membership)return null
      const balance=(creditBalances||[]).find((row:any)=>row.ledger_system==='offering'&&row.product_id===program.id&&row.credit_type==='session')
      const cycle=currentCycles.get(membership.id)||null
      const subscription=(recurringSubscriptions||[]).find((row:any)=>row.offering_id===program.id)||null
      return {...membership,subscription_id:subscription?.id||null,subscription_status:subscription?.status||null,
        cancel_at_period_end:Boolean(subscription?.cancel_at_period_end||membership.cancel_at_period_end),
        access_allowed:membership.status==='active'&&Boolean(cycle),current_cycle:cycle,
        credits_issued:Number(cycle?.credits_issued||0),credits_spent:Number(cycle?.credits_spent||0),
        credits_remaining:Number(balance?.credits_remaining||0),next_expiration:cycle?.period_end||balance?.next_expiration||null}
    })(),
    occurrences: (() => {
      const membership=(creditMemberships||[]).find((row:any)=>row.offering_id===program.id)
      const cycle=membership?.status==='active'?currentCycles.get(membership.id):null
      const isCredit=String(program.fulfillment_mode)==='credit_membership'
      const registration=registrationMap.get(String(program.id))
      const initialWindowEnd=new Date(Date.now()+31*24*60*60*1000).getTime()
      return (occurrences || []).filter((row: any) => {
        if(row.offering_id!==program.id)return false
        if(!isCredit)return true
        const startsAt=new Date(row.starts_at).getTime()
        if(cycle)return startsAt>=new Date(cycle.period_start).getTime()&&startsAt<new Date(cycle.period_end).getTime()
        if(membership && membership.status!=='pending')return false
        return !registration||registration.status==='pending' ? startsAt<initialWindowEnd : false
      }).map((row:any)=>{const snapshot=capacityByOccurrence.get(row.id);return{...row,registered_count:Number(snapshot?.reserved_count||0),available_spots:snapshot?.availability==null?null:Number(snapshot.availability),is_available:Boolean(snapshot?.is_available)}})
    })(),
  }))

  return NextResponse.json({ programs: rows, athlete_profile_id: athlete.profileId }, { headers: privateHeaders })
}

export async function POST(request: Request) {
  const { session, supabase, error } = await getSessionRole(['athlete'])
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  const programId = String(body?.program_id || '').trim()
  const requestedProfileId = String(body?.athlete_profile_id || session.user.user_metadata?.selected_athlete_profile_id || '').trim()
  const paymentPlan = body?.payment_plan === true
  const occurrenceIds = Array.isArray(body?.occurrence_ids)
    ? body.occurrence_ids.map((value: unknown) => String(value || '').trim()).filter(Boolean)
    : [String(body?.occurrence_id || '').trim()].filter(Boolean)
  const occurrenceId = occurrenceIds[0] || ''
  if (!programId) return jsonError('Program is required.')

  const athlete = await resolveAuthorizedAthleteContext(session.user.id, requestedProfileId)
  if (!athlete) return jsonError('Athlete profile not found or access denied.', 404)

  const [{ data: visible }, { data: program }, { count: occupiedCount }, { data: existing }, { data: availableOccurrences }] = await Promise.all([
    supabase.rpc('is_org_program_visible', {
      target_program_id: programId,
      target_athlete_id: athlete.profileId,
    }),
    supabaseAdmin.from('programs').select('id,org_id,type,price,price_per_occurrence,fulfillment_mode,credits_per_period,billing_type,billing_interval,credit_expiration_days,renews_until_cancelled,end_date,cancellation_cutoff_hours,capacity,status,payment_plan_enabled,payment_plan_installments,payment_plan_frequency,payment_plan_first_payment_cents').eq('id', programId).maybeSingle(),
    supabaseAdmin.from('program_registrations').select('id', { count: 'exact', head: true }).eq('program_id', programId).in('status', ['pending', 'paid']),
    supabaseAdmin.from('program_registrations').select('id,occurrence_id,status,registered_at').eq('program_id', programId).eq('athlete_profile_id', athlete.profileId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    (supabaseAdmin as any).from('org_offering_occurrences').select('id').eq('offering_id',programId).eq('status','published').gt('starts_at',new Date().toISOString()),
  ])
  if (visible !== true || !program || program.status !== 'active') return jsonError('Program is unavailable.', 404)
  const recurringMonthly = Boolean(program.renews_until_cancelled) || String(program.billing_interval || '') === 'month'
  if (!recurringMonthly && program.end_date && program.end_date < new Date().toISOString().slice(0, 10)) return jsonError('This program is no longer available for registration.', 409)
  const fulfillmentMode = String(program.fulfillment_mode || 'series')
  if (existing && ['paid', 'confirmed', 'active'].includes(String(existing.status || ''))) {
    if (fulfillmentMode === 'credit_membership' && occurrenceIds.length) {
      const { error: bookingError } = await (supabase as any).rpc('select_family_offering_occurrences', { p_registration_id: existing.id, p_offering_type: String(program.type || 'program'), p_occurrence_ids: occurrenceIds, p_athlete_id: athlete.profileId })
      if (bookingError) { const safe=safeOfferingReservationError(bookingError); return NextResponse.json({error:{code:safe.code,message:safe.message,retryable:false}},{status:safe.status}) }
      return NextResponse.json({ registration: { ...existing, occurrence_id: occurrenceId }, checkout_required: false, booked: true })
    }
    return NextResponse.json({ registration: existing, checkout_required: false })
  }
  if (fulfillmentMode !== 'credit_membership' && (availableOccurrences || []).length && !occurrenceId) return jsonError('Select an available date and time.', 400)
  const capacity = Number(program.capacity || 0)
  if (!existing && capacity > 0 && (occupiedCount || 0) >= capacity) return jsonError('Program is full.', 409)

  if (occurrenceIds.length !== new Set(occurrenceIds).size) return jsonError('Duplicate dates are not allowed.', 400)
  const unitPriceCents = Math.max(0, Math.round(Number(program.price_per_occurrence ?? program.price ?? 0) * 100))
  const priceCents = fulfillmentMode === 'free' ? 0
    : fulfillmentMode === 'per_occurrence' ? unitPriceCents * occurrenceIds.length
      : Math.max(0, Math.round(Number(program.price || 0) * 100))
  const status = priceCents > 0 ? 'pending' : 'paid'
  const payload = {
    program_id: programId,
    athlete_profile_id: athlete.profileId,
    owner_user_id: session.user.id,
    status,
    fulfillment_mode: fulfillmentMode,
    unit_price_cents: fulfillmentMode === 'per_occurrence' ? unitPriceCents : priceCents,
    quantity: fulfillmentMode === 'per_occurrence' ? occurrenceIds.length : 1,
    subtotal_cents: priceCents,
    final_amount_cents: priceCents,
    ...(status === 'paid' ? { registered_at: new Date().toISOString() } : {}),
  }
  const registrationResult = existing
    ? await supabaseAdmin.from('program_registrations').update(payload).eq('id', existing.id).select('id,status,registered_at').single()
    : await supabaseAdmin.from('program_registrations').insert(payload).select('id,status,registered_at').single()
  if (registrationResult.error || !registrationResult.data) return jsonError('Unable to register for this program.', 500)
  // Initial monthly-membership choices are capacity holds until Stripe activates
  // the membership. The database enforces credits_per_period transactionally.
  if (occurrenceIds.length) {
    const { error: occurrenceError } = await (supabase as any).rpc('select_family_offering_occurrences', { p_registration_id: registrationResult.data.id, p_offering_type: String(program.type || 'program'), p_occurrence_ids: occurrenceIds, p_athlete_id: athlete.profileId })
    if (occurrenceError) { const safe=safeOfferingReservationError(occurrenceError); return NextResponse.json({error:{code:safe.code,message:safe.message,retryable:false}},{status:safe.status}) }
    ;(registrationResult.data as any).occurrence_id = occurrenceId
  }

  if (fulfillmentMode === 'credit_membership' && status === 'paid' && String(program.billing_type || 'one_time') === 'one_time') {
    const { error: activationError } = await (supabaseAdmin as any).rpc('activate_one_time_org_offering_credit_pack', { p_registration_id: registrationResult.data.id, p_period_start: new Date().toISOString() })
    if (activationError) return jsonError('Registration was saved, but its credits could not be activated. Contact support with the registration ID.', 500)
  }

  if (paymentPlan) {
    if (!program.payment_plan_enabled || Number(program.payment_plan_installments || 0) < 2) {
      return jsonError('A payment plan is not available for this program.', 409)
    }
    const { data: enrollmentId, error: enrollmentError } = await supabase.rpc('enroll_program_payment_plan', {
      p_program_id: programId,
      p_athlete_profile_id: athlete.profileId,
    })
    if (enrollmentError || !enrollmentId) return jsonError('Unable to enroll in the payment plan.', 500)
    const { data: installment, error: installmentError } = await supabaseAdmin
      .from('family_payment_plan_installments')
      .select('id')
      .eq('enrollment_id', enrollmentId)
      .eq('sequence_number', 1)
      .single()
    if (installmentError || !installment) return jsonError('Unable to prepare the first installment.', 500)
    return NextResponse.json({
      registration: registrationResult.data,
      checkout_required: true,
      checkout_type: 'installment',
      checkout_record_id: installment.id,
      payment_plan_enrollment_id: enrollmentId,
    }, { status: existing ? 200 : 201, headers: privateHeaders })
  }

  return NextResponse.json({
    registration: registrationResult.data,
    checkout_required: priceCents > 0,
    checkout_type: fulfillmentMode === 'credit_membership' && String(program.billing_type) === 'recurring' ? 'recurring_program' : 'program',
    checkout_record_id: registrationResult.data.id,
    fulfillment_mode: fulfillmentMode,
    unit_price_cents: fulfillmentMode === 'per_occurrence' ? unitPriceCents : priceCents,
    quantity: fulfillmentMode === 'per_occurrence' ? occurrenceIds.length : 1,
    subtotal_cents: priceCents,
    occurrence_ids: occurrenceIds,
    organization_id: program.org_id,
    offering_id: program.id,
  }, { status: existing ? 200 : 201, headers: privateHeaders })
}
