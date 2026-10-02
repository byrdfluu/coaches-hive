export type OfferingBillingType = 'free' | 'one_time' | 'recurring'
export type OfferingBillingInterval = 'month' | 'year' | null

export type OfferingBillingContract = {
  billingType: OfferingBillingType
  billingInterval: OfferingBillingInterval
}

export const normalizeOfferingBilling = (
  billingType: unknown,
  billingInterval: unknown,
  amountCents: number,
): OfferingBillingContract => {
  const explicitType = String(billingType || '').trim().toLowerCase()
  const type: OfferingBillingType = explicitType === 'recurring'
    ? 'recurring'
    : explicitType === 'free' || amountCents <= 0
      ? 'free'
      : 'one_time'
  const interval = String(billingInterval || '').trim().toLowerCase()
  return {
    billingType: type,
    billingInterval: type === 'recurring' && (interval === 'month' || interval === 'year') ? interval : null,
  }
}

export const validateOfferingBilling = (input: {
  billing_type?: unknown
  billing_interval?: unknown
  amount_cents: number
}) => {
  const rawType = String(input.billing_type || (input.amount_cents > 0 ? 'one_time' : 'free')).trim().toLowerCase()
  const rawInterval = input.billing_interval == null ? '' : String(input.billing_interval).trim().toLowerCase()
  if (!['free', 'one_time', 'recurring'].includes(rawType)) {
    return { ok: false as const, code: 'INVALID_BILLING_TYPE', message: 'billing_type must be free, one_time, or recurring.' }
  }
  if (rawType === 'recurring') {
    if (!['month', 'year'].includes(rawInterval)) {
      return { ok: false as const, code: 'INVALID_BILLING_INTERVAL', message: 'Recurring offerings require billing_interval month or year.' }
    }
    if (input.amount_cents <= 0) {
      return { ok: false as const, code: 'INVALID_RECURRING_AMOUNT', message: 'Recurring offerings require a positive price.' }
    }
  } else if (rawInterval) {
    return { ok: false as const, code: 'INVALID_BILLING_INTERVAL', message: 'Free and one-time offerings cannot include billing_interval.' }
  }
  if (rawType === 'free' && input.amount_cents > 0) {
    return { ok: false as const, code: 'INVALID_FREE_PRICE', message: 'Free offerings cannot include a positive price.' }
  }
  return { ok: true as const, value: { billing_type: rawType as OfferingBillingType, billing_interval: rawType === 'recurring' ? rawInterval as 'month' | 'year' : null } }
}
