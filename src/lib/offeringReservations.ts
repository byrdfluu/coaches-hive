import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type OfferingRegistrationType = 'program' | 'tryout'

const RESERVATION_ERRORS: Record<string, { code: string; message: string; status: number }> = {
  OFFERING_FULL: { code: 'OFFERING_FULL', message: 'This date and time is full.', status: 409 },
  OCCURRENCE_UNAVAILABLE: { code: 'OCCURRENCE_UNAVAILABLE', message: 'This date and time is unavailable.', status: 409 },
  REGISTRATION_NOT_RESERVABLE: { code: 'REGISTRATION_NOT_RESERVABLE', message: 'This registration can no longer be reserved.', status: 409 },
  CREDITS_EXHAUSTED: { code: 'CREDITS_EXHAUSTED', message: 'There are not enough credits for this date and time.', status: 409 },
  CREDIT_BALANCE_INSUFFICIENT: { code: 'CREDIT_BALANCE_INSUFFICIENT', message: 'There are not enough credits for this booking.', status: 409 },
  OCCURRENCE_OUTSIDE_PAID_PERIOD: { code: 'OCCURRENCE_OUTSIDE_PAID_PERIOD', message: 'This date is outside your current paid membership period.', status: 409 },
  PAYMENT_REQUIRED: { code: 'PAYMENT_REQUIRED', message: 'A successful membership payment is required before choosing dates.', status: 402 },
  REGISTRATION_FORBIDDEN: { code: 'REGISTRATION_FORBIDDEN', message: 'You are not allowed to reserve this registration.', status: 403 },
}

export function safeOfferingReservationError(error: unknown) {
  const raw = String((error as { message?: unknown } | null)?.message || '')
  const key = Object.keys(RESERVATION_ERRORS).find(value => raw.includes(value))
  return key ? RESERVATION_ERRORS[key] : {
    code: 'OCCURRENCE_UNAVAILABLE', message: 'A selected date and time is unavailable.', status: 409,
  }
}

export async function countActiveOfferingSelections(type: OfferingRegistrationType, registrationId: string) {
  const { data, error } = await (supabaseAdmin as any).from('org_offering_registration_occurrences')
    .select('status,reserved_until').eq('registration_type', type).eq('registration_id', registrationId)
    .in('status', ['pending_payment', 'reserved'])
  if (error) throw error
  const now = Date.now()
  return (data || []).filter((row: any) => row.status === 'reserved'
    || (row.status === 'pending_payment' && row.reserved_until && new Date(row.reserved_until).getTime() > now)).length
}

export async function bindOfferingCheckoutReservation(input: {
  registrationType: OfferingRegistrationType
  registrationId: string
  checkoutSessionId: string
  expiresAt: number
}) {
  const { error } = await (supabaseAdmin as any).rpc('bind_offering_checkout_reservation', {
    p_registration_type: input.registrationType,
    p_registration_id: input.registrationId,
    p_checkout_session_id: input.checkoutSessionId,
    p_expires_at: new Date(input.expiresAt * 1000).toISOString(),
  })
  if (error) throw error
}

export async function releaseOfferingCheckoutReservation(
  registrationType: OfferingRegistrationType,
  registrationId: string,
  checkoutSessionId: string | null,
) {
  const { error } = await (supabaseAdmin as any).rpc('release_offering_checkout_reservation', {
    p_registration_type: registrationType,
    p_registration_id: registrationId,
    p_checkout_session_id: checkoutSessionId,
  })
  if (error) throw error
}

export async function offeringCapacitySnapshot(occurrenceIds: string[]) {
  if (!occurrenceIds.length) return new Map<string, any>()
  const { data, error } = await (supabaseAdmin as any).rpc('offering_occurrence_capacity_snapshot', {
    p_occurrence_ids: occurrenceIds,
  })
  if (error) throw error
  return new Map((data || []).map((row: any) => [row.occurrence_id, row]))
}
