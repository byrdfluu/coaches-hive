export const ORGANIZATION_AGREEMENT_VERSION = '2026.09'
export const ORGANIZATION_AGREEMENT_EFFECTIVE_DATE = 'September 22, 2026'

export const ORGANIZATION_AGREEMENTS = [
  { key: 'organization_terms', label: 'Organization Terms', href: '/organization-terms' },
  { key: 'data_processing_addendum', label: 'Data Processing Addendum', href: '/data-processing-addendum' },
  { key: 'acceptable_use_policy', label: 'Acceptable Use Policy', href: '/safety' },
  { key: 'payment_services_terms', label: 'Payment Services Terms', href: '/payment-terms' },
  { key: 'privacy_policy', label: 'Privacy Policy', href: '/privacy' },
] as const

export const ORGANIZATION_AUTHORITY_CONFIRMATION =
  'I confirm that I am authorized to act on behalf of this organization and accept the Coaches Hive organization agreements.'

export const ORGANIZATION_MINOR_DATA_CONFIRMATION =
  'I understand that the organization is responsible for obtaining required notices, permissions, and guardian consents before submitting athlete or minor information.'

export const organizationRecurringBillingConfirmation = (priceCents: number, billingInterval: 'month' | 'year', trialDays = 0) => {
  const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(priceCents / 100)
  const trial = trialDays > 0 ? ` after the ${trialDays}-day trial` : ''
  return `I authorize Coaches Hive to charge ${price} per ${billingInterval}${trial}. The subscription renews automatically every ${billingInterval} until canceled. I can cancel online at any time; cancellation takes effect at the end of the current billing period. No prorated refunds are provided except where required by law.`
}
