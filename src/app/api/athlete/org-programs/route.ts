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

  if (body?.action === 'withdraw_enrollment') {
    const { data, error: withdrawalError } = await (supabase as any).rpc('withdraw_family_program_registration', {
      p_offering_id: programId,
      p_athlete_id: athlete.profileId,
    })
    if (withdrawalError) {
      const missing = String(withdrawalError.message || '').includes('REGISTRATION_NOT_FOUND')
      return jsonError(missing ? 'Registration not found.' : 'Unable to withdraw this enrollment.', missing ? 404 : 409)
    }
    return NextResponse.json({ withdrawal: data }, { headers: privateHeaders })
  }

  const [{ data: visible }, { data: program }, { count: occupiedCount }, { data: existing }, { data: availableOccurrences }] = await Promise.all([
    supabase.rpc('is_org_program_visible', {
      target_program_id: programId,
      target_athlete_id: athlete.profileId,
    }),
    supabaseAdmin.from('programs').select('id,org_id,type,price,attendance_model,sessions_included,fulfillment_mode,credits_per_period,billing_type,billing_interval,credit_expiration_days,renews_until_cancelled,end_date,cancellation_cutoff_hours,capacity,status').eq('id', programId).maybeSingle(),
    supabaseAdmin.from('program_registrations').select('id', { count: 'exact', head: true }).eq('program_id', programId).in('status', ['pending', 'paid']),
    supabaseAdmin.from('program_registrations').select('id,occurrence_id,status,registered_at').eq('program_id', programId).eq('athlete_profile_id', athlete.profileId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    (supabaseAdmin as any).from('org_offering_occurrences').select('id').eq('offering_id',programId).eq('status','published').gt('starts_at',new Date().toISOString()),
  ])
  if (visible !== true || !program || program.status !== 'active') return jsonError('Program is unavailable.', 404)
  const recurringMonthly = Boolean(program.renews_until_cancelled) || String(program.billing_interval || '') === 'month'
  if (!recurringMonthly && program.end_date && program.end_date < new Date().toISOString().slice(0, 10)) return jsonError('This program is no longer available for registration.', 409)
  const fulfillmentMode = String(program.fulfillment_mode || 'series')
  const attendanceModel=String(program.attendance_model||'')||(fulfillmentMode==='free'?'free':fulfillmentMode==='credit_membership'&&program.billing_type==='recurring'?'monthly_session_membership':fulfillmentMode==='credit_membership'?'prepaid_session_pack':'fixed_enrollment')
  if (existing && ['paid', 'confirmed', 'active'].includes(String(existing.status || ''))) {
    if (['monthly_session_membership','prepaid_session_pack'].includes(attendanceModel) && occurrenceIds.length) {
      const { error: bookingError } = await (supabase as any).rpc('select_family_offering_occurrences', { p_registration_id: existing.id, p_offering_type: String(program.type || 'program'), p_occurrence_ids: occurrenceIds, p_athlete_id: athlete.profileId })
      if (bookingError) { const safe=safeOfferingReservationError(bookingError); return NextResponse.json({error:{code:safe.code,message:safe.message,retryable:false}},{status:safe.status}) }
      return NextResponse.json({ registration: { ...existing, occurrence_id: occurrenceId }, checkout_required: false, booked: true })
    }
    return NextResponse.json({ registration: existing, checkout_required: false })
  }
  if ((availableOccurrences || []).length && !occurrenceId) return jsonError('Select an available date and time.', 400)
  const capacity = Number(program.capacity || 0)
  if (!existing && capacity > 0 && (occupiedCount || 0) >= capacity) return jsonError('Program is full.', 409)

  if (occurrenceIds.length !== new Set(occurrenceIds).size) return jsonError('Duplicate dates are not allowed.', 400)
  const unitPriceCents = Math.max(0, Math.round(Number(program.price || 0) * 100))
  const priceCents = attendanceModel === 'free' ? 0 : unitPriceCents
  const status = priceCents > 0 ? 'pending' : 'paid'
  const payload = {
    program_id: programId,
    athlete_profile_id: athlete.profileId,
    owner_user_id: session.user.id,
    status,
    fulfillment_mode: fulfillmentMode,
    unit_price_cents: priceCents,
    quantity: 1,
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

  if(attendanceModel==='prepaid_session_pack'){
    const{data:membership}=await(supabaseAdmin as any).from('org_offering_credit_memberships').select('id').eq('offering_id',program.id)
      .eq('athlete_id',athlete.profileId).in('status',['pending','active','past_due']).maybeSingle()
    if(!membership){const{error}=await(supabaseAdmin as any).from('org_offering_credit_memberships').insert({org_id:program.org_id,
      offering_id:program.id,athlete_id:athlete.profileId,purchaser_user_id:session.user.id,status:'pending'});if(error)return jsonError('Unable to prepare the session pack.',500)}
  }
  if(paymentPlan)return jsonError('Payment plans are not available for unified offerings.',409)

  return NextResponse.json({
    registration: registrationResult.data,
    checkout_required: priceCents > 0,
    checkout_type: attendanceModel === 'monthly_session_membership' ? 'recurring_program' : 'program',
    checkout_record_id: registrationResult.data.id,
    fulfillment_mode: fulfillmentMode,
    attendance_model:attendanceModel,sessions_included:program.sessions_included||null,
    unit_price_cents: priceCents,
    quantity: 1,
    subtotal_cents: priceCents,
    occurrence_ids: occurrenceIds,
    organization_id: program.org_id,
    offering_id: program.id,
  }, { status: existing ? 200 : 201, headers: privateHeaders })
}
