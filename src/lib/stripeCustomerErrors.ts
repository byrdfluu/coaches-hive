export const MISSING_STRIPE_BILLING_ACCOUNT_MESSAGE =
  'No active Stripe billing account found. Please contact support or start a new checkout.'

export const isMissingStripeCustomerError = (err: unknown) => {
  if (!err || typeof err !== 'object') return false
  const stripeError = err as {
    code?: string
    param?: string
    message?: string
    raw?: { code?: string; param?: string; message?: string }
  }
  const code = stripeError.code || stripeError.raw?.code
  const param = stripeError.param || stripeError.raw?.param
  const message = stripeError.message || stripeError.raw?.message || ''
  return code === 'resource_missing' && (param === 'customer' || message.includes('No such customer'))
}
