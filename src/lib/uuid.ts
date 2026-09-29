/** PostgreSQL UUID values are case-insensitive; canonicalize request values before comparison. */
export const normalizeUuid = (value: unknown) => String(value || '').trim().toLowerCase()
