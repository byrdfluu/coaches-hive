import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')) throw new Error('A live-mode STRIPE_SECRET_KEY is required.')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const apply = process.argv.includes('--apply')
const archiveLegacy = process.argv.includes('--archive-legacy')
const products = [
  {
    name: 'Individual Coach Plan',
    planType: 'individual_coach',
    prices: [
      ['STRIPE_PRICE_COACH_ALL_ACCESS_MONTHLY', 1900, 'month', 'individual_coach_monthly'],
      ['STRIPE_PRICE_COACH_ALL_ACCESS_ANNUAL', 19000, 'year', 'individual_coach_annual'],
    ],
  },
  {
    name: 'Organization Plan',
    planType: 'organization',
    prices: [
      ['STRIPE_PRICE_ORG_ALL_ACCESS_MONTHLY', 9900, 'month', 'organization_monthly'],
      ['STRIPE_PRICE_ORG_ALL_ACCESS_ANNUAL', 99000, 'year', 'organization_annual'],
    ],
  },
]

const keepProductIds = new Set()
for (const definition of products) {
  const found = await stripe.products.search({ query: `active:'true' AND name:'${definition.name}'`, limit: 1 })
  const product = found.data[0] || (apply ? await stripe.products.create({
    name: definition.name,
    metadata: { coaches_hive_subscription: 'true', plan_type: definition.planType, pricing_contract: '2026-08-17' },
  }) : null)
  if (product) keepProductIds.add(product.id)

  for (const [envKey, amount, interval, lookupKey] of definition.prices) {
    const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
    let price = existing.data[0]
    if (price && (price.unit_amount !== amount || price.recurring?.interval !== interval || price.product !== product?.id)) {
      throw new Error(`Existing lookup key ${lookupKey} does not match the pricing contract.`)
    }
    if (!price && apply) {
      if (!product) throw new Error(`Product ${definition.name} does not exist.`)
      price = await stripe.prices.create({
        product: product.id, currency: 'usd', unit_amount: amount,
        recurring: { interval }, lookup_key: lookupKey,
        metadata: { plan_type: definition.planType, pricing_contract: '2026-08-17' },
      })
    }
    console.log(`${envKey}=${price?.id || `CREATE ${definition.name} ${interval} $${amount / 100}`}`)
  }
}

if (apply && archiveLegacy) {
  const activeProducts = await stripe.products.list({ active: true, limit: 100 })
  for (const product of activeProducts.data) {
    if (keepProductIds.has(product.id)) continue
    const recurring = await stripe.prices.list({ product: product.id, active: true, type: 'recurring', limit: 100 })
    if (!recurring.data.length) continue
    if (product.default_price) await stripe.products.update(product.id, { default_price: '' })
    for (const price of recurring.data) await stripe.prices.update(price.id, { active: false })
    await stripe.products.update(product.id, { active: false })
    console.log(`ARCHIVED ${product.id} ${product.name}`)
  }
}

if (!apply) console.log('Dry run only. Use --apply to create missing objects; add --archive-legacy to deactivate legacy recurring catalog objects.')
