import type Stripe from 'stripe'

type ChargeLike = Pick<Stripe.Charge, 'application_fee' | 'transfer_data'>

export const getConnectRefundOptions = (charge: ChargeLike | null | undefined) => {
  const applicationFeeId =
    typeof charge?.application_fee === 'string'
      ? charge.application_fee
      : charge?.application_fee && typeof charge.application_fee === 'object'
        ? charge.application_fee.id || null
        : null

  return {
    applicationFeeId,
    refundApplicationFee: Boolean(applicationFeeId),
    reverseTransfer: Boolean(charge?.transfer_data?.destination),
  }
}
