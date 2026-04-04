import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import stripe from '@/lib/stripeServer'
import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgTier, normalizeSchoolTier } from '@/lib/planRules'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ORG_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

const SCHOOL_ROLES = new Set(['school_admin', 'athletic_director', 'program_director'])

type BillingRole = 'coach' | 'athlete' | 'org'

const getBaseUrl = (request: Request) => {
  const requestUrl = new URL(request.url)
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || `${requestUrl.protocol}//${requestUrl.host}`
}

const resolveBillingRole = (role?: string | null): BillingRole | null => {
  if (role === 'coach') return 'coach'
  if (role === 'athlete') return 'athlete'
  if (role && ORG_ROLES.has(role)) return 'org'
  return null
}

const normalizeTierForRole = (role: BillingRole, tier?: string | null, sessionRole?: string) => {
  if (role === 'coach') return normalizeCoachTier(tier)
  if (role === 'athlete') return normalizeAthleteTier(tier)
  if (sessionRole && SCHOOL_ROLES.has(sessionRole)) return normalizeSchoolTier(tier)
  return normalizeOrgTier(tier)
}

const getPriceId = (role: BillingRole, tier: string, schoolRole?: boolean): string | null => {
  const keysByRoleAndTier: Record<BillingRole, Record<string, string[]>> = {
    coach: {
      starter: ['STRIPE_PRICE_COACH_STARTER_MONTHLY', 'STRIPE_PRICE_COACH_BASIC_MONTHLY'],
      pro: ['STRIPE_PRICE_COACH_PRO_MONTHLY'],
      elite: ['STRIPE_PRICE_COACH_ELITE_MONTHLY'],
    },
    athlete: {
      explore: ['STRIPE_PRICE_ATHLETE_EXPLORE_MONTHLY', 'STRIPE_PRICE_ATHLETE_BASIC_MONTHLY'],
      train: ['STRIPE_PRICE_ATHLETE_TRAIN_MONTHLY', 'STRIPE_PRICE_ATHLETE_PRO_MONTHLY'],
      family: ['STRIPE_PRICE_ATHLETE_FAMILY_MONTHLY', 'STRIPE_PRICE_ATHLETE_ELITE_MONTHLY'],
    },
    org: schoolRole
      ? {
          starter: ['STRIPE_PRICE_SCHOOL_STARTER_MONTHLY'],
          program: ['STRIPE_PRICE_SCHOOL_PROGRAM_MONTHLY'],
          district: ['STRIPE_PRICE_SCHOOL_DISTRICT_MONTHLY'],
        }
      : {
          standard: ['STRIPE_PRICE_ORG_STANDARD_MONTHLY', 'STRIPE_PRICE_ORG_BASIC_MONTHLY'],
          growth: ['STRIPE_PRICE_ORG_GROWTH_MONTHLY', 'STRIPE_PRICE_ORG_PRO_MONTHLY'],
          enterprise: ['STRIPE_PRICE_ORG_ENTERPRISE_MONTHLY', 'STRIPE_PRICE_ORG_ELITE_MONTHLY'],
        },
  }

  const candidates = keysByRoleAndTier[role]?.[tier] || []
  for (const key of candidates) {
    const value = process.env[key]
    if (value) return value
  }
  return null
}

const sanitizeReturnTo = (value: unknown, baseUrl: string) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return null
  if (raw.startsWith('/')) {
    return raw.startsWith('//') ? null : raw
  }
  try {
    const parsed = new URL(raw)
    if (parsed.origin !== baseUrl) return null
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole([
    'athlete',
    'coach',
    'org_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'club_admin',
    'travel_admin',
    'admin',
    'superadmin',
  ])
  if (error || !session) return error

  const userId = session.user.id
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle()

  if (!profile?.stripe_customer_id) {
    return jsonError('No Stripe billing account found. Complete a subscription checkout first.', 404)
  }

  const baseUrl = getBaseUrl(request)
  const sessionRole = String(role || '')
  const billingRole = resolveBillingRole(sessionRole)
  if (!billingRole) {
    return jsonError('Unsupported role for billing portal', 400)
  }

  const body = await request.json().catch(() => ({}))
  const referer = request.headers.get('referer') || ''
  const explicitReturnTo = sanitizeReturnTo((body as Record<string, unknown>)?.returnTo, baseUrl)
  const fallbackPath =
    billingRole === 'coach' ? '/coach/settings' : billingRole === 'athlete' ? '/athlete/settings' : '/org/settings'
  const returnUrl = explicitReturnTo
    ? `${baseUrl}${explicitReturnTo}`
    : referer.startsWith(baseUrl)
      ? referer
      : `${baseUrl}${fallbackPath}`

  const requestedFlow = String((body as Record<string, unknown>)?.flow || '').trim()
  const requestedTier = String((body as Record<string, unknown>)?.tier || '').trim()

  let flowData: Stripe.BillingPortal.SessionCreateParams['flow_data'] | undefined
  if (requestedFlow === 'subscription_update' || requestedFlow === 'subscription_update_confirm') {
    const subs = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'all',
      limit: 10,
    })
    const activeSub = subs.data.find((s) => {
      if (s.status !== 'active' && s.status !== 'trialing') return false
      const metadata = (s.metadata || {}) as Record<string, string>
      return String(metadata.billing_role || '').trim().toLowerCase() === billingRole
    })
    if (activeSub) {
      if (requestedFlow === 'subscription_update_confirm' && requestedTier) {
        const normalizedTier = normalizeTierForRole(billingRole, requestedTier, sessionRole)
        const priceId = getPriceId(billingRole, normalizedTier, SCHOOL_ROLES.has(sessionRole))
        const activeItem = activeSub.items?.data?.[0]
        const activePriceId = activeItem?.price?.id || null
        if (!priceId) {
          return jsonError('Stripe price for the selected plan is not configured.', 500)
        }
        if (!activeItem?.id) {
          return jsonError('Subscription item not found. Please contact support.', 500)
        }
        if (activePriceId === priceId) {
          return jsonError(`You are already on the ${normalizedTier} plan.`, 400)
        }
        flowData = {
          type: 'subscription_update_confirm',
          after_completion: {
            type: 'redirect',
            redirect: { return_url: returnUrl },
          },
          subscription_update_confirm: {
            subscription: activeSub.id,
            items: [
              {
                id: activeItem.id,
                price: priceId,
                quantity: activeItem.quantity || 1,
              },
            ],
          },
        } as Stripe.BillingPortal.SessionCreateParams['flow_data']
      } else {
        flowData = {
          type: 'subscription_update',
          after_completion: {
            type: 'redirect',
            redirect: { return_url: returnUrl },
          },
          subscription_update: { subscription: activeSub.id },
        } as Stripe.BillingPortal.SessionCreateParams['flow_data']
      }
    } else {
      return jsonError('No active subscription found. Complete a checkout first.', 404)
    }
  }

  try {
    const session_ = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
      ...(flowData ? { flow_data: flowData } : {}),
    })
    return NextResponse.json({ url: session_.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to open billing portal'
    return jsonError(message, 500)
  }
}
