import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getAdminConfig } from '@/lib/adminConfig'
export const dynamic = 'force-dynamic'

// Run this migration in Supabase SQL editor before using feature flags:
//
// CREATE TABLE IF NOT EXISTS platform_settings (
//   key   text PRIMARY KEY,
//   value jsonb NOT NULL DEFAULT 'null',
//   updated_at timestamptz NOT NULL DEFAULT now(),
//   updated_by uuid REFERENCES auth.users(id)
// );

const FEATURE_FLAG_KEYS = [
  'allow_signups',
  'maintenance_mode',
  'allow_coach_registration',
  'allow_athlete_registration',
  'allow_org_registration',
  'email_verification_required',
] as const

type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number]

const FLAG_DEFAULTS: Record<FeatureFlagKey, boolean> = {
  allow_signups: true,
  maintenance_mode: false,
  allow_coach_registration: true,
  allow_athlete_registration: true,
  allow_org_registration: true,
  email_verification_required: true,
}

const FLAG_LABELS: Record<FeatureFlagKey, { label: string; description: string }> = {
  allow_signups: { label: 'Allow new signups', description: 'Permit new users to create accounts' },
  maintenance_mode: { label: 'Maintenance mode', description: 'Block all non-admin access with a maintenance message' },
  allow_coach_registration: { label: 'Coach self-registration', description: 'Coaches can sign up independently' },
  allow_athlete_registration: { label: 'Athlete self-registration', description: 'Athletes can sign up independently' },
  allow_org_registration: { label: 'Org self-registration', description: 'Org admins can create accounts' },
  email_verification_required: { label: 'Email verification required', description: 'Users must verify email before accessing dashboard' },
}

const boolEnv = (key: string) => Boolean(process.env[key])
const stripeMode = () => {
  const key = process.env.STRIPE_SECRET_KEY || ''
  if (!key) return null
  return key.startsWith('sk_live_') ? 'live' : 'test'
}
const postmarkOverride = () => {
  const val = process.env.POSTMARK_TO_OVERRIDE || ''
  return val.trim() || null
}

export async function GET() {
  const { session, error } = await getSessionRole(['admin', 'superadmin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  // Integration health — only reports presence/config, never raw secret values.
  const integrations = {
    supabase: {
      configured: boolEnv('NEXT_PUBLIC_SUPABASE_URL') && boolEnv('SUPABASE_SERVICE_ROLE_KEY'),
      project_ref: (() => {
        try {
          const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
          return new URL(url).hostname.split('.')[0] || null
        } catch { return null }
      })(),
    },
    stripe: {
      configured: boolEnv('STRIPE_SECRET_KEY') && boolEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
      mode: stripeMode(),
      webhook_configured: boolEnv('STRIPE_WEBHOOK_SECRET'),
      connect_configured: boolEnv('STRIPE_CONNECT_WEBHOOK_SECRET'),
    },
    postmark: {
      configured: boolEnv('POSTMARK_SERVER_TOKEN') && boolEnv('POSTMARK_FROM_EMAIL'),
      from_email: process.env.POSTMARK_FROM_EMAIL || null,
      sandbox_override: postmarkOverride(),
    },
    sentry: {
      configured: boolEnv('SENTRY_AUTH_TOKEN') && boolEnv('SENTRY_ORG_SLUG'),
    },
    google_oauth: {
      configured: boolEnv('GOOGLE_OAUTH_CLIENT_ID') && boolEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
    },
    zoom: {
      configured: boolEnv('ZOOM_OAUTH_CLIENT_ID') && boolEnv('ZOOM_OAUTH_CLIENT_SECRET'),
    },
  }

  // Feature flags from platform_settings table. Gracefully handle missing table.
  let flags: Record<FeatureFlagKey, boolean> = { ...FLAG_DEFAULTS }
  try {
    const { data: rows } = await supabaseAdmin
      .from('platform_settings')
      .select('key, value')
      .in('key', FEATURE_FLAG_KEYS as unknown as string[])
    if (rows) {
      for (const row of rows) {
        const k = row.key as FeatureFlagKey
        if (k in FLAG_DEFAULTS && typeof row.value === 'boolean') {
          flags[k] = row.value
        }
      }
    }
  } catch {
    // Table doesn't exist yet — return defaults silently.
  }

  const flagsWithMeta = (Object.keys(FLAG_DEFAULTS) as FeatureFlagKey[]).map((k) => ({
    key: k,
    value: flags[k],
    ...FLAG_LABELS[k],
  }))

  const automations = await getAdminConfig<{
    onboardingFlows?: Array<{ id?: string; title?: string; status?: string }>
    retentionAutomations?: Array<{ id?: string; title?: string; status?: string }>
  }>('automations')

  const notificationRules = [
    { event: 'Signup — email verification code', status: 'Active' },
    { event: 'Booking confirmed (coach)', status: 'Active' },
    { event: 'Booking confirmed (athlete)', status: 'Active' },
    { event: 'Session reminder', status: 'Active' },
    { event: 'Session cancelled (coach)', status: 'Active' },
    { event: 'Session cancelled (athlete)', status: 'Active' },
    { event: 'Payment receipt', status: 'Active' },
    { event: 'Welcome email', status: 'Active' },
    { event: 'Password reset', status: 'Active' },
    { event: '@Mention in message', status: 'Active' },
    { event: 'Org announcement delivered', status: 'Active' },
    {
      event: 'Onboarding drip sequence',
      status:
        automations?.onboardingFlows?.find((flow) => flow.id === 'onboarding_drip_sequence')?.status || 'Active',
    },
    {
      event: 'Failed payment warning',
      status:
        automations?.retentionAutomations?.find((flow) => flow.id === 'failed_payment_warning')?.status || 'Active',
    },
    {
      event: 'Re-engagement (inactive user)',
      status:
        automations?.retentionAutomations?.find((flow) => flow.id === 'inactive_user_reengagement')?.status || 'Active',
    },
  ]

  return NextResponse.json({ integrations, flags: flagsWithMeta, notification_rules: notificationRules })
}

export async function PATCH(request: Request) {
  const { session, error } = await getSessionRole(['admin', 'superadmin'])
  if (error || !session) return error ?? jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => ({}))
  const key = String(body?.key || '')
  const value = body?.value

  if (!FEATURE_FLAG_KEYS.includes(key as FeatureFlagKey)) {
    return jsonError('Invalid feature flag key')
  }
  if (typeof value !== 'boolean') {
    return jsonError('value must be a boolean')
  }

  try {
    const { error: upsertError } = await supabaseAdmin
      .from('platform_settings')
      .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: session.user.id })
    if (upsertError) return jsonError(upsertError.message, 500)
  } catch {
    return jsonError('platform_settings table not found. Run the migration first.', 500)
  }

  return NextResponse.json({ key, value })
}
