import * as Sentry from '@sentry/nextjs'

type FlowStatus = 'started' | 'succeeded' | 'failed'

type FlowContext = {
  flow: string
  step: string
  status: FlowStatus
  userId?: string | null
  role?: string | null
  entityId?: string | null
  metadata?: Record<string, unknown>
}

const describeUnknownError = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const maybeError = error as {
      message?: unknown
      details?: unknown
      hint?: unknown
      code?: unknown
      error_description?: unknown
    }
    const parts = [
      maybeError.message,
      maybeError.details,
      maybeError.hint,
      maybeError.error_description,
      maybeError.code ? `code=${String(maybeError.code)}` : null,
    ]
      .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
      .filter(Boolean)
    if (parts.length > 0) return parts.join(' | ')
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

const sanitizeMetadata = (metadata?: Record<string, unknown>) => {
  if (!metadata) return {}

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (value === undefined) return [key, null]
      if (value === null) return [key, null]
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return [key, value]
      }
      if (Array.isArray(value)) {
        return [key, value.map((entry) => (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean' ? entry : String(entry)))]
      }
      return [key, String(value)]
    }),
  )
}

export const trackServerFlowEvent = (context: FlowContext) => {
  const payload = {
    flow: context.flow,
    step: context.step,
    status: context.status,
    userId: context.userId || null,
    role: context.role || null,
    entityId: context.entityId || null,
    metadata: sanitizeMetadata(context.metadata),
  }

  const message = `[flow] ${payload.flow}:${payload.step}:${payload.status}`

  if (context.status === 'failed') {
    console.error(message, payload)
  } else {
    console.info(message, payload)
  }

  Sentry.addBreadcrumb({
    category: 'flow',
    level: context.status === 'failed' ? 'error' : 'info',
    message,
    data: payload,
  })
}

export const trackServerFlowFailure = (
  error: unknown,
  context: Omit<FlowContext, 'status'>,
) => {
  const describedError = describeUnknownError(error)

  trackServerFlowEvent({
    ...context,
    status: 'failed',
    metadata: {
      ...context.metadata,
      error: describedError,
    },
  })

  if (error instanceof Error) {
    Sentry.captureException(error, {
      tags: {
        flow: context.flow,
        step: context.step,
      },
      extra: {
        userId: context.userId || null,
        role: context.role || null,
        entityId: context.entityId || null,
        metadata: sanitizeMetadata(context.metadata),
      },
    })
  } else {
    Sentry.captureException(new Error(describedError), {
      tags: {
        flow: context.flow,
        step: context.step,
      },
      extra: {
        userId: context.userId || null,
        role: context.role || null,
        entityId: context.entityId || null,
        metadata: sanitizeMetadata(context.metadata),
      },
    })
  }
}
