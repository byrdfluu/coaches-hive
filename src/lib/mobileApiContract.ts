import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

export type MobileFieldErrors = Record<string, string>

const INTERNAL_ERROR_PATTERN = /(?:postgres|postgrest|supabase|stripe|sqlstate|relation\s+["']|column\s+["']|constraint\s+["']|duplicate key|violates?\s+(?:check|foreign key|not-null)|pgrst\d*|stack trace|api key|bearer\s+|secret\s+key|schema cache)/i

const fallbackMessage = (status: number) => status === 401
  ? 'Authentication is required.'
  : status === 403
    ? 'You do not have permission to perform this action.'
    : status === 404
      ? 'The requested item is unavailable.'
      : status === 409
        ? 'This action conflicts with the current state. Refresh and try again.'
        : status === 410
          ? 'This item has expired.'
          : status === 422
            ? 'Review the highlighted information and try again.'
            : status === 429
              ? 'Too many requests. Please try again shortly.'
              : 'This service is temporarily unavailable. Please try again.'

export const safeMobileMessage = (message: unknown, status: number) => {
  const candidate = typeof message === 'string' ? message.trim() : ''
  if (!candidate || status >= 500 || INTERNAL_ERROR_PATTERN.test(candidate)) return fallbackMessage(status)
  return candidate.slice(0, 500)
}

export const mobileApiError = (input: {
  code: string
  message: unknown
  status: number
  requestId: string
  retryable?: boolean
  fieldErrors?: MobileFieldErrors
}) => {
  const status = input.status === 400 ? 422 : input.status
  const fieldErrors = status === 422 ? (input.fieldErrors || {}) : undefined
  return NextResponse.json({
    error: {
      code: input.code,
      message: safeMobileMessage(input.message, status),
      retryable: input.retryable === true,
      request_id: input.requestId,
      ...(fieldErrors ? { field_errors: fieldErrors } : {}),
    },
  }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-ID': input.requestId,
    },
  })
}

export const mobileContractError = (
  code: string,
  message: unknown,
  status: number,
  retryable = status === 429 || status >= 500,
  fieldErrors?: MobileFieldErrors,
) => mobileApiError({ code, message, status, retryable, requestId: randomUUID(), fieldErrors })
