import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2025-12-15.clover' })
  : (new Proxy(
      {},
      {
        get() {
          throw new Error('Missing STRIPE_SECRET_KEY')
        },
      }
    ) as Stripe)

export default stripe
