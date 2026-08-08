import {
  Environment,
  type JWSTransactionDecodedPayload,
  type JWSRenewalInfoDecodedPayload,
  SignedDataVerifier,
  Status,
} from '@apple/app-store-server-library'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const APPLE_BUNDLE_ID = 'com.coacheshive.mobile'

export const APPLE_PRODUCTS = {
  'com.coacheshive.mobile.coachallaccess.monthly': {
    planKey: 'coach_all_access',
    role: 'coach',
    interval: 'month',
  },
  'com.coacheshive.mobile.coachallaccess.annual': {
    planKey: 'coach_all_access',
    role: 'coach',
    interval: 'year',
  },
  'com.coacheshive.mobile.familyallaccess.monthly': {
    planKey: 'family_all_access',
    role: 'athlete',
    interval: 'month',
  },
  'com.coacheshive.mobile.familyallaccess.annual': {
    planKey: 'family_all_access',
    role: 'athlete',
    interval: 'year',
  },
} as const

export type ApplePlanKey = 'coach_all_access' | 'family_all_access'
type AppleProductId = keyof typeof APPLE_PRODUCTS

const parseRootCertificates = () => {
  const encoded = process.env.APPLE_ROOT_CERTIFICATES_BASE64?.trim()
  if (!encoded) throw new Error('APPLE_ROOT_CERTIFICATES_BASE64 is not configured')
  let values: string[]
  try {
    const parsed = JSON.parse(encoded)
    values = Array.isArray(parsed) ? parsed : [encoded]
  } catch {
    values = encoded.split(',').map((value) => value.trim()).filter(Boolean)
  }
  const certificates = values.map((value) => Buffer.from(value, 'base64')).filter((value) => value.length > 0)
  if (!certificates.length) throw new Error('Apple root certificates are not configured')
  return certificates
}

const configuredEnvironments = () => {
  const configured = String(process.env.APPLE_IAP_ENVIRONMENTS || 'Production,Sandbox')
    .split(',')
    .map((value) => value.trim().toLowerCase())
  const environments: Environment[] = []
  if (configured.includes('production')) environments.push(Environment.PRODUCTION)
  if (configured.includes('sandbox')) environments.push(Environment.SANDBOX)
  if (!environments.length) throw new Error('APPLE_IAP_ENVIRONMENTS must include Production or Sandbox')
  return environments
}

const verifierFor = (environment: Environment) => {
  const appAppleId = environment === Environment.PRODUCTION
    ? Number(process.env.APPLE_APP_ID || 0)
    : undefined
  if (environment === Environment.PRODUCTION && !appAppleId) {
    throw new Error('APPLE_APP_ID is required for Production verification')
  }
  return new SignedDataVerifier(
    parseRootCertificates(),
    true,
    environment,
    APPLE_BUNDLE_ID,
    appAppleId,
  )
}

const verifyWithConfiguredEnvironment = async <T>(
  operation: (verifier: SignedDataVerifier) => Promise<T>,
) => {
  let lastError: unknown = null
  for (const environment of configuredEnvironments()) {
    try {
      return { payload: await operation(verifierFor(environment)), environment }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Apple signature verification failed')
}

export const verifyAppleTransaction = (signedTransaction: string) =>
  verifyWithConfiguredEnvironment((verifier) => verifier.verifyAndDecodeTransaction(signedTransaction))

export const verifyAppleNotification = (signedPayload: string) =>
  verifyWithConfiguredEnvironment((verifier) => verifier.verifyAndDecodeNotification(signedPayload))

export const verifyAppleRenewalInfo = (
  signedRenewalInfo: string,
  environment: Environment,
) => verifierFor(environment).verifyAndDecodeRenewalInfo(signedRenewalInfo)

export const verifyAppleTransactionForEnvironment = (
  signedTransaction: string,
  environment: Environment,
) => verifierFor(environment).verifyAndDecodeTransaction(signedTransaction)

export const productDefinition = (productId?: string | null) =>
  productId && productId in APPLE_PRODUCTS
    ? APPLE_PRODUCTS[productId as AppleProductId]
    : null

const asIso = (value?: number | null) => value ? new Date(value).toISOString() : null
const normalizeToken = (value?: string | null) => String(value || '').trim().toLowerCase()
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const assertAppleAccountTokenOwner = (
  appAccountToken: string | null | undefined,
  userId: string,
) => {
  const token = normalizeToken(appAccountToken)
  const authenticatedUserId = normalizeToken(userId)
  if (
    !UUID_PATTERN.test(token)
    || !UUID_PATTERN.test(authenticatedUserId)
    || token !== authenticatedUserId
  ) {
    throw new Error('Apple transaction appAccountToken does not match the authenticated user')
  }
}

export const validateAppleActivation = async ({
  transaction,
  verifiedEnvironment,
  userId,
  actorRole,
  planKey,
}: {
  transaction: JWSTransactionDecodedPayload
  verifiedEnvironment: Environment
  userId: string
  actorRole: 'coach' | 'athlete' | 'org'
  planKey: ApplePlanKey
}) => {
  const definition = productDefinition(transaction.productId)
  if (!definition) throw new Error('Unrecognized App Store product')
  if (actorRole === 'org') throw new Error('Organization subscriptions are Stripe-only')
  if (definition.role !== actorRole || definition.planKey !== planKey) {
    throw new Error('App Store product does not match the account plan')
  }
  if (transaction.bundleId !== APPLE_BUNDLE_ID) throw new Error('App Store bundle ID mismatch')
  if (transaction.environment !== verifiedEnvironment) throw new Error('App Store environment mismatch')
  if (!transaction.transactionId || !transaction.originalTransactionId) {
    throw new Error('Apple transaction identifiers are missing')
  }
  if (!transaction.expiresDate || transaction.expiresDate <= Date.now()) {
    throw new Error('Apple subscription has expired')
  }
  if (transaction.revocationDate || transaction.revocationReason !== undefined) {
    throw new Error('Apple subscription has been revoked or refunded')
  }
  assertAppleAccountTokenOwner(transaction.appAccountToken, userId)

  const { data: existing, error } = await supabaseAdmin
    .from('apple_iap_subscriptions')
    .select('user_id')
    .eq('original_transaction_id', transaction.originalTransactionId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (existing && existing.user_id !== userId) throw new Error('Apple transaction belongs to another account')

  return { definition, existing }
}

export const persistAppleSubscription = async ({
  userId,
  transaction,
  renewal,
  status,
}: {
  userId: string
  transaction: JWSTransactionDecodedPayload
  renewal?: JWSRenewalInfoDecodedPayload | null
  status: 'active' | 'past_due' | 'canceled'
}) => {
  const definition = productDefinition(transaction.productId)
  if (!definition || !transaction.originalTransactionId || !transaction.transactionId) {
    throw new Error('Invalid Apple subscription transaction')
  }
  const expiresAt = asIso(transaction.expiresDate)
  const revokedAt = asIso(transaction.revocationDate)
  const cancelAtPeriodEnd = renewal?.autoRenewStatus === 0
  const ownerId = userId
  const platformTier = definition.role === 'coach' ? 'all_access' : 'family_all_access'
  const { data: independentWorkspace, error: workspaceError } = definition.role === 'coach'
    ? await supabaseAdmin
        .from('business_workspaces')
        .select('id')
        .eq('workspace_type', 'independent_coach')
        .eq('owner_user_id', userId)
        .maybeSingle()
    : { data: null, error: null }
  if (workspaceError) throw new Error(workspaceError.message)
  if (definition.role === 'coach' && !independentWorkspace?.id) {
    throw new Error('Activate an independent coaching workspace before purchasing Coach All Access')
  }
  const workspaceId = independentWorkspace?.id || null

  const { error: appleError } = await supabaseAdmin.from('apple_iap_subscriptions').upsert({
    original_transaction_id: transaction.originalTransactionId,
    user_id: userId,
    owner_type: definition.role,
    owner_id: ownerId,
    workspace_id: workspaceId,
    plan_key: definition.planKey,
    product_id: transaction.productId,
    latest_transaction_id: transaction.transactionId,
    environment: transaction.environment,
    status,
    expires_at: expiresAt,
    revoked_at: revokedAt,
    cancel_at_period_end: cancelAtPeriodEnd,
    last_signed_date: asIso(transaction.signedDate),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'original_transaction_id' })
  if (appleError) throw new Error(appleError.message)

  const { error: platformError } = await supabaseAdmin.from('platform_subscriptions').upsert({
    owner_type: definition.role,
    owner_id: ownerId,
    user_id: userId,
    organization_id: null,
    workspace_id: workspaceId,
    tier: platformTier,
    status,
    billing_interval: definition.interval,
    current_period_end: expiresAt,
    cancel_at_period_end: cancelAtPeriodEnd,
    purchase_channel: 'apple_iap',
    apple_original_transaction_id: transaction.originalTransactionId,
    apple_latest_transaction_id: transaction.transactionId,
    apple_product_id: transaction.productId,
    apple_environment: transaction.environment,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_type,owner_id' })
  if (platformError) throw new Error(platformError.message)

  return { definition, expiresAt, cancelAtPeriodEnd }
}

export const statusFromAppleNotification = ({
  notificationType,
  subscriptionStatus,
  transaction,
}: {
  notificationType?: string
  subscriptionStatus?: number
  transaction: JWSTransactionDecodedPayload
}): 'active' | 'past_due' | 'canceled' => {
  if (
    notificationType === 'REFUND'
    || notificationType === 'REVOKE'
    || notificationType === 'EXPIRED'
    || transaction.revocationDate
    || subscriptionStatus === Status.REVOKED
    || subscriptionStatus === Status.EXPIRED
  ) return 'canceled'
  if (
    notificationType === 'DID_FAIL_TO_RENEW'
    || notificationType === 'GRACE_PERIOD_EXPIRED'
    || subscriptionStatus === Status.BILLING_RETRY
  ) return 'past_due'
  return transaction.expiresDate && transaction.expiresDate > Date.now() ? 'active' : 'canceled'
}
