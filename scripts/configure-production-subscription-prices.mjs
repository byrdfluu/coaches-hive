import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
  throw new Error('A live-mode STRIPE_SECRET_KEY is required.')
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const apply = process.argv.includes('--apply')
const definitions = [
  ['STRIPE_PRICE_COACH_ALL_ACCESS_MONTHLY', 'Independent Coach All Access', 9900, 'month', 'coach_all_access_monthly_2026_08'],
  ['STRIPE_PRICE_COACH_ALL_ACCESS_ANNUAL', 'Independent Coach All Access', 99000, 'year', 'coach_all_access_annual_2026_08'],
  ['STRIPE_PRICE_ORG_STARTER_MONTHLY', 'Organization Starter', 39900, 'month', 'org_starter_monthly_2026_08'],
  ['STRIPE_PRICE_ORG_STARTER_ANNUAL', 'Organization Starter', 399000, 'year', 'org_starter_annual_2026_08'],
  ['STRIPE_PRICE_ORG_GROWTH_MONTHLY', 'Organization Growth', 99900, 'month', 'org_growth_monthly_2026_08'],
  ['STRIPE_PRICE_ORG_GROWTH_ANNUAL', 'Organization Growth', 999000, 'year', 'org_growth_annual_2026_08'],
]

const products = new Map()
for (const [, name] of definitions) {
  if (products.has(name)) continue
  const existing = await stripe.products.search({ query: `active:'true' AND name:'${name}'`, limit: 1 })
  const product = existing.data[0] || (apply ? await stripe.products.create({ name, metadata: { coaches_hive_subscription: 'true', pricing_contract: '2026-08-08' } }) : null)
  products.set(name, product)
}

const output = {}
for (const [envKey, productName, unitAmount, interval, lookupKey] of definitions) {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
  let price = existing.data[0]
  if (price && (price.unit_amount !== unitAmount || price.recurring?.interval !== interval)) {
    throw new Error(`Existing lookup key ${lookupKey} does not match the approved contract.`)
  }
  if (!price && apply) {
    const product = products.get(productName)
    if (!product) throw new Error(`Product ${productName} does not exist.`)
    price = await stripe.prices.create({
      product: product.id, currency: 'usd', unit_amount: unitAmount,
      recurring: { interval }, lookup_key: lookupKey,
      metadata: { coaches_hive_plan: envKey, pricing_contract: '2026-08-08' },
    })
  }
  output[envKey] = price?.id || `CREATE ${productName} ${interval} $${unitAmount / 100}`
}

for (const [key, value] of Object.entries(output)) console.log(`${key}=${value}`)
if (!apply) console.log('Dry run only. Re-run with --apply to create missing live-mode Products and Prices.')
