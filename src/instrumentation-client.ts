import * as Sentry from '@sentry/nextjs'
import posthog from 'posthog-js'
import { isSupabaseAuthRateLimitError, isSupabaseBrowserAuthLockError } from '@/lib/authSessionRecovery'
import { redactTelemetry } from '@/lib/telemetryRedaction'

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
    beforeSend(event, hint) {
      if (isSupabaseBrowserAuthLockError(hint?.originalException) || isSupabaseAuthRateLimitError(hint?.originalException)) return null
      const exceptionValue = event.exception?.values?.map((value) => value.value || '').join(' ') || ''
      if (isSupabaseBrowserAuthLockError(exceptionValue) || isSupabaseAuthRateLimitError(exceptionValue)) return null
      return redactTelemetry(event) as typeof event
    },
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

const postHogEnabled = process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_POSTHOG_ENABLED === 'true'

if (process.env.NEXT_PUBLIC_POSTHOG_TOKEN && postHogEnabled) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_TOKEN, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    capture_exceptions: true,
    debug: process.env.NODE_ENV === 'development',
    before_send(event) {
      if (!event) return null
      return {
        ...event,
        properties: redactTelemetry(event.properties) as typeof event.properties,
        $set: event.$set ? redactTelemetry(event.$set) as typeof event.$set : event.$set,
        $set_once: event.$set_once
          ? redactTelemetry(event.$set_once) as typeof event.$set_once
          : event.$set_once,
      }
    },
  })
}
