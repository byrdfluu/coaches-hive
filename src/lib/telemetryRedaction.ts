const SENSITIVE_KEY = /^(authorization|cookie|set-cookie|code|token|refresh_token|access_token)$/i
const SENSITIVE_QUERY = /([?&](?:code|token|refresh_token|access_token)=)[^&#]*/gi

export const redactSensitiveText = (value: string) =>
  value.replace(SENSITIVE_QUERY, '$1[REDACTED]').replace(/#.*$/, '#[REDACTED]')

export const redactTelemetry = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (typeof value === 'string') return redactSensitiveText(value)
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)
  if (Array.isArray(value)) return value.map(item => redactTelemetry(item, seen))
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactTelemetry(item, seen),
  ]))
}
