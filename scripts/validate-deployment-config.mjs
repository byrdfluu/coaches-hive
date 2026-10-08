import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd(), true)

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SITE_URL',
  'STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'MOBILE_CHECKOUT_TOKEN_SECRET',
  'INTEGRATIONS_STATE_SECRET',
  'POSTMARK_SERVER_TOKEN',
  'POSTMARK_FROM_EMAIL',
  'POSTMARK_WEBHOOK_SECRET',
  'SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN',
]

const paired = [
  ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'],
  ['ZOOM_OAUTH_CLIENT_ID', 'ZOOM_OAUTH_CLIENT_SECRET'],
  ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_SUPPORT_EMAIL'],
  ['APNS_PRIVATE_KEY', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID'],
  ['APPLE_APP_ID', 'APPLE_ROOT_CERTIFICATES_BASE64'],
]

const missing = required.filter(key => !String(process.env[key] || '').trim())
const incompleteGroups = paired.filter(group => {
  const configured = group.filter(key => String(process.env[key] || '').trim())
  return configured.length > 0 && configured.length < group.length
})

const errors = []
if (missing.length) errors.push(`Missing required variables: ${missing.join(', ')}`)
for (const group of incompleteGroups) errors.push(`Incomplete integration group: ${group.join(', ')}`)

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
if (siteUrl && !/^https:\/\//.test(siteUrl) && process.env.NODE_ENV === 'production') {
  errors.push('NEXT_PUBLIC_SITE_URL must use HTTPS in production')
}
if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') && !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_live_')) {
  errors.push('Live Stripe secret key must be paired with a live publishable key')
}
if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') && !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_')) {
  errors.push('Test Stripe secret key must be paired with a test publishable key')
}

if (errors.length) {
  console.error('Deployment configuration is not ready:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Deployment configuration valid: ${required.length} required variables and ${paired.length} integration groups checked.`)
