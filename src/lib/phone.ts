export const usPhoneDigits = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

/** Return the canonical U.S. display format, or null for blank/invalid input. */
export const formatUsPhone = (value: unknown): string | null => {
  const digits = usPhoneDigits(value)
  if (!digits) return null
  if (digits.length !== 10) return null
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export const isBlankPhone = (value: unknown) => String(value || '').trim() === ''
