import * as Sentry from '@sentry/nextjs'

export async function register() {
  // Sentry requires `init()` to happen inside the instrumentation hook.
  // Keep config env-driven (prefer server-only vars, fall back to NEXT_PUBLIC for convenience).
  const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1')
  const profilesSampleRate = Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? process.env.NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE ?? '0.0')

  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
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
}

export const onRequestError = Sentry.captureRequestError;
