import { NextResponse } from 'next/server'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { normalizeOfferingBilling } from '@/lib/offeringBilling'
import { requestIdFor } from '@/lib/requestSecurity'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'

const fail = (code: string, message: string, status: number, retryable = status >= 500) =>
  NextResponse.json({ error: { code, message, retryable } }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const requestId = requestIdFor(request)
  const user = await getMobileRequestUser(request)
  if (!user) return fail('UNAUTHORIZED', 'Authentication is required.', 401, false)
  const body = await request.json().catch(() => ({}))
  const offeringType = String(body.offering_type || '').trim().toLowerCase()
  const offeringId = normalizeUuid(body.offering_id)
  const athleteId = normalizeUuid(body.athlete_profile_id)
  const organizationId = normalizeUuid(body.organization_id)
  if (!['program', 'camp', 'clinic', 'league', 'tryout'].includes(offeringType) || !offeringId || !athleteId || !organizationId) {
    return fail('INVALID_REQUEST', 'Offering, organization, and athlete are required.', 422, false)
  }
  const athlete = await resolveAuthorizedAthleteContext(user.id, athleteId)
  if (!athlete) return fail('ATHLETE_PROFILE_UNAVAILABLE', 'Athlete profile is unavailable.', 404, false)

  try {
    if (offeringType !== 'tryout') {
      const [{ data: program }, { data: visible }, { data: existing }, { count: occupied }] = await Promise.all([
        supabaseAdmin.from('programs').select('id,org_id,type,status,price,billing_type,billing_interval,capacity')
          .eq('id', offeringId).eq('org_id', organizationId).maybeSingle(),
        supabaseAdmin.rpc('is_org_program_visible', { target_program_id: offeringId, target_athlete_id: athlete.profileId }),
        supabaseAdmin.from('program_registrations').select('id,status').eq('program_id', offeringId)
          .eq('athlete_profile_id', athlete.profileId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabaseAdmin.from('program_registrations').select('id', { count: 'exact', head: true })
          .eq('program_id', offeringId).in('status', ['pending', 'paid']),
      ])
      if (!program || program.status !== 'active' || visible !== true) return fail('OFFERING_UNAVAILABLE', 'This program is unavailable.', 404, false)
      if (String(program.type || 'program') !== offeringType && !(offeringType === 'program' && !program.type)) {
        return fail('OFFERING_UNAVAILABLE', 'This program is unavailable.', 404, false)
      }
      if (!existing && Number(program.capacity || 0) > 0 && Number(occupied || 0) >= Number(program.capacity)) {
        return fail('OFFERING_FULL', 'This program is full.', 409, false)
      }
      const amountCents = Math.max(0, Math.round(Number(program.price || 0) * 100))
      const billing = normalizeOfferingBilling(program.billing_type, program.billing_interval, amountCents)
      if (existing?.status === 'paid') {
        return NextResponse.json({ registration_id: existing.id, status: 'paid', checkout_required: false, checkout_type: null })
      }
      const registrationStatus = amountCents > 0 ? 'pending' : 'paid'
      const payload = { program_id: program.id, athlete_profile_id: athlete.profileId, owner_user_id: user.id,
        status: registrationStatus, ...(registrationStatus === 'paid' ? { registered_at: new Date().toISOString() } : {}) }
      const result = existing
        ? await supabaseAdmin.from('program_registrations').update(payload).eq('id', existing.id).select('id,status').single()
        : await supabaseAdmin.from('program_registrations').insert(payload).select('id,status').single()
      if (result.error || !result.data) throw result.error || new Error('Registration was not created')
      return NextResponse.json({ registration_id: result.data.id, status: result.data.status, checkout_required: amountCents > 0,
        checkout_type: amountCents > 0 ? (billing.billingType === 'recurring' ? 'recurring_offering' : 'program') : null,
        billing_type: billing.billingType, billing_interval: billing.billingInterval }, { status: existing ? 200 : 201 })
    }

    const [{ data: tryout }, { data: membership }, { data: existing }, { count: occupied }] = await Promise.all([
      supabaseAdmin.from('org_tryouts').select('id,org_id,status,price,billing_type,billing_interval,max_participants')
        .eq('id', offeringId).eq('org_id', organizationId).maybeSingle(),
      supabaseAdmin.from('athlete_organization_memberships').select('id').eq('athlete_id', athlete.profileId)
        .eq('org_id', organizationId).eq('status', 'active').maybeSingle(),
      supabaseAdmin.from('org_tryout_registrations').select('id,status').eq('tryout_id', offeringId)
        .eq('athlete_profile_id', athlete.profileId).maybeSingle(),
      supabaseAdmin.from('org_tryout_registrations').select('id', { count: 'exact', head: true })
        .eq('tryout_id', offeringId).in('status', ['pending', 'paid']),
    ])
    if (!tryout || !['open', 'published', 'active'].includes(String(tryout.status)) || !membership) {
      return fail('OFFERING_UNAVAILABLE', 'This tryout is unavailable.', 404, false)
    }
    if (!existing && Number(tryout.max_participants || 0) > 0 && Number(occupied || 0) >= Number(tryout.max_participants)) {
      return fail('OFFERING_FULL', 'This tryout is full.', 409, false)
    }
    const amountCents = Math.max(0, Math.round(Number(tryout.price || 0) * 100))
    const billing = normalizeOfferingBilling(tryout.billing_type, tryout.billing_interval, amountCents)
    if (existing?.status === 'paid') return NextResponse.json({ registration_id: existing.id, status: 'paid', checkout_required: false, checkout_type: null })
    const registrationStatus = amountCents > 0 ? 'pending' : 'paid'
    const payload = { tryout_id: tryout.id, athlete_profile_id: athlete.profileId, owner_user_id: user.id,
      status: registrationStatus, registered_at: new Date().toISOString() }
    const result = existing
      ? await supabaseAdmin.from('org_tryout_registrations').update(payload).eq('id', existing.id).select('id,status').single()
      : await supabaseAdmin.from('org_tryout_registrations').insert(payload).select('id,status').single()
    if (result.error || !result.data) throw result.error || new Error('Registration was not created')
    return NextResponse.json({ registration_id: result.data.id, status: result.data.status, checkout_required: amountCents > 0,
      checkout_type: amountCents > 0 ? (billing.billingType === 'recurring' ? 'recurring_offering' : 'tryout') : null,
      billing_type: billing.billingType, billing_interval: billing.billingInterval }, { status: existing ? 200 : 201 })
  } catch (error) {
    console.error('[mobile/family/offerings/prepare] failed', { request_id: requestId, user_id: user.id,
      organization_id: organizationId, athlete_profile_id: athlete.profileId, offering_type: offeringType,
      error: error instanceof Error ? error.message : 'Unknown error' })
    return fail('REGISTRATION_PREPARE_FAILED', 'We could not prepare this registration. Please try again.', 503, true)
  }
}
