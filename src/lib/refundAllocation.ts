export type RefundType = 'standard' | 'full_org_caused'

export function calculateRefundAllocation(input: {
  type: RefundType
  baseAmountCents: number
  requestedBaseRefundCents: number
  serviceFeeCents: number
  platformFeeCents: number
  organizationNetCents: number
  stripeProcessingFeeCents: number
}) {
  const baseRefund = Math.min(input.baseAmountCents, Math.max(0, Math.round(input.requestedBaseRefundCents)))
  const fraction = baseRefund / input.baseAmountCents
  const serviceFeeRefundCents = input.type === 'full_org_caused' ? Math.ceil(input.serviceFeeCents * fraction) : 0
  const parentRefundCents = baseRefund + serviceFeeRefundCents
  const transferReversalCents = Math.min(input.organizationNetCents, Math.ceil(input.organizationNetCents * fraction))
  const organizationReceivableCents = serviceFeeRefundCents
  return {
    baseRefundCents: baseRefund,
    serviceFeeRefundCents,
    parentRefundCents,
    transferReversalCents,
    organizationReceivableCents,
    parentEndBalanceCents: input.baseAmountCents + input.serviceFeeCents - parentRefundCents,
    organizationEndBalanceCents: input.organizationNetCents - transferReversalCents - organizationReceivableCents,
    platformEndBalanceCents: input.platformFeeCents + input.serviceFeeCents - input.stripeProcessingFeeCents
      + transferReversalCents + organizationReceivableCents - parentRefundCents,
  }
}
