import { ORGANIZATION_AGREEMENT_VERSION } from '@/lib/legalAgreements'

export const ORGANIZATION_PAYMENT_POLICY_VERSION = '2026-09-25'

export const ORGANIZATION_PLATFORM_FEE_RATE = 0.04
export const PARENT_SERVICE_FEE_RATE = 0.035
export const PARENT_SERVICE_FEE_FIXED_CENTS = 30

export type OrganizationPaymentMethodType = 'card' | 'us_bank_account' | 'pending'

export type OrganizationPaymentContract = {
  base_amount_cents: number
  service_fee_cents: number
  platform_fee_cents: number
  total_cents: number
  organization_net_cents: number
  payment_method_type: OrganizationPaymentMethodType
  service_fee_refundable: false
  policy_version: string
  agreement_version: string
}

const cents = (value: number) => {
  const normalized = Number(value)
  if (!Number.isFinite(normalized)) throw new Error('Payment amount must be a finite number of cents')
  return Math.max(0, Math.round(normalized))
}

export const calculateOrganizationPayment = (
  baseAmountCents: number,
  paymentMethodType: OrganizationPaymentMethodType = 'pending',
): OrganizationPaymentContract & { application_fee_cents: number } => {
  const base = cents(baseAmountCents)
  if (base <= 0) throw new Error('Base payment amount must be positive')

  // Integer-ratio math avoids IEEE-754 artifacts such as $100 producing $3.81.
  const serviceFee = Math.ceil((base * 35) / 1_000) + PARENT_SERVICE_FEE_FIXED_CENTS
  const platformFee = Math.ceil((base * 4) / 100)

  return {
    base_amount_cents: base,
    service_fee_cents: serviceFee,
    platform_fee_cents: platformFee,
    total_cents: base + serviceFee,
    organization_net_cents: base - platformFee,
    application_fee_cents: platformFee + serviceFee,
    payment_method_type: paymentMethodType,
    service_fee_refundable: false,
    policy_version: ORGANIZATION_PAYMENT_POLICY_VERSION,
    agreement_version: ORGANIZATION_AGREEMENT_VERSION,
  }
}

export const organizationPaymentMetadata = (
  contract: OrganizationPaymentContract & { application_fee_cents: number },
) => ({
  baseAmountCents: String(contract.base_amount_cents),
  serviceFeeCents: String(contract.service_fee_cents),
  totalAmountCents: String(contract.total_cents),
  organizationNetCents: String(contract.organization_net_cents),
  serviceFeeRefundable: String(contract.service_fee_refundable),
  paymentPolicyVersion: contract.policy_version,
  agreementVersion: contract.agreement_version,
})

export const organizationCheckoutLineItems = (name: string, contract: OrganizationPaymentContract) => [
  {
    price_data: {
      currency: 'usd',
      unit_amount: contract.base_amount_cents,
      product_data: { name },
    },
    quantity: 1,
  },
  {
    price_data: {
      currency: 'usd',
      unit_amount: contract.service_fee_cents,
      product_data: {
        name: 'Service fee (non-refundable)',
        description: 'Covers payment processing for this transaction.',
      },
    },
    quantity: 1,
  },
]
