/** PostgreSQL UUID values are case-insensitive; canonicalize request values before comparison. */
export const normalizeUuid = (value: unknown) => String(value || '').trim().toLowerCase()

/**
 * Accept the textual UUID shape used by PostgreSQL without assuming a specific
 * UUID version. This keeps validation compatible with imported legacy UUIDs.
 */
export const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim())

/** Normalize valid UUID input and return null for missing or malformed input. */
export const parseUuid = (value: unknown) => {
  const normalized = normalizeUuid(value)
  return isUuid(normalized) ? normalized : null
}
