export type YouthRegistrationCheck = {
  birthDate: string | null
  age: number | null
  isMinor: boolean
  isUnder13: boolean
  error?: string
}

export function checkYouthRegistration(value: unknown, now = new Date()): YouthRegistrationCheck {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return { birthDate: null, age: null, isMinor: false, isUnder13: false }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { birthDate: null, age: null, isMinor: false, isUnder13: false, error: 'A valid date of birth is required' }
  const birth = new Date(`${raw}T12:00:00.000Z`)
  if (!Number.isFinite(birth.getTime()) || birth >= now) return { birthDate: null, age: null, isMinor: false, isUnder13: false, error: 'Date of birth must be in the past' }
  let age = now.getUTCFullYear() - birth.getUTCFullYear()
  const hadBirthday = now.getUTCMonth() > birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate())
  if (!hadBirthday) age -= 1
  if (age > 25) return { birthDate: null, age, isMinor: false, isUnder13: false, error: 'Player must be 25 years old or younger' }
  return { birthDate: raw, age, isMinor: age < 18, isUnder13: age < 13 }
}
