export const MOBILE_ONBOARDING_SUBSCRIPTION_BLOCKED_MESSAGE =
  'Mobile onboarding subscription checkout is no longer available. Manage or cancel existing Coaches Hive subscriptions on the web at /account/billing.'

export const isMobileOnboardingSubscriptionCheckoutBlocked = (type?: string | null) =>
  String(type || '').trim().toLowerCase() === 'onboarding'
