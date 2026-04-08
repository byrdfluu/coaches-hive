type SentryModule = typeof import('@sentry/nextjs')

let sentryModulePromise: Promise<SentryModule> | null = null

const loadSentry = () => {
  if (!sentryModulePromise) {
    sentryModulePromise = import('@sentry/nextjs')
  }
  return sentryModulePromise
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  const Sentry = await loadSentry()

  // Sentry requires `init()` to happen inside the instrumentation hook.
  // Keep config env-driven (prefer server-only vars, fall back to NEXT_PUBLIC for convenience).
  const tracesSampleRate = Number(
    process.env.SENTRY_TRACES_SAMPLE_RATE ?? process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'
  )
  const profilesSampleRate = Number(
    process.env.SENTRY_PROFILES_SAMPLE_RATE ?? process.env.NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE ?? '0.0'
  )

  Sentry.init({
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    enabled: (process.env.SENTRY_ENABLED ?? process.env.NEXT_PUBLIC_SENTRY_ENABLED ?? 'true') !== 'false',
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
    profilesSampleRate: Number.isFinite(profilesSampleRate) ? profilesSampleRate : 0.0,
    enableLogs: (process.env.SENTRY_ENABLE_LOGS ?? 'true') !== 'false',
    sendDefaultPii: (process.env.SENTRY_SEND_DEFAULT_PII ?? 'true') === 'true',
  })
}

export async function onRequestError(...args: Parameters<SentryModule['captureRequestError']>) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  const Sentry = await loadSentry()
  return Sentry.captureRequestError(...args)
}
