import * as Sentry from '@sentry/nextjs'

declare global {
  // eslint-disable-next-line no-var
  var __CH_SENTRY_CLIENT_INITED__: boolean | undefined
}

const tracesSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1')
const profilesSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE ?? '0.0')
const replaysSessionSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? '0.0')
const replaysOnErrorSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? '0.0')

if (!globalThis.__CH_SENTRY_CLIENT_INITED__) {
  globalThis.__CH_SENTRY_CLIENT_INITED__ = true
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    enabled: process.env.NEXT_PUBLIC_SENTRY_ENABLED !== 'false',
    environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
    profilesSampleRate: Number.isFinite(profilesSampleRate) ? profilesSampleRate : 0.0,
    replaysSessionSampleRate: Number.isFinite(replaysSessionSampleRate) ? replaysSessionSampleRate : 0.0,
    replaysOnErrorSampleRate: Number.isFinite(replaysOnErrorSampleRate) ? replaysOnErrorSampleRate : 0.0,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
