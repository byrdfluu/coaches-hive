type PayoutCadence = 'weekly' | 'biweekly' | 'monthly'

const DEFAULT_PAYOUT_CADENCE: PayoutCadence = 'weekly'
const DEFAULT_PAYOUT_DAY = 'Friday'
const DEFAULT_PAYOUT_HOUR = 9

const cadenceMap: Record<string, PayoutCadence> = {
  weekly: 'weekly',
  'bi-weekly': 'biweekly',
  biweekly: 'biweekly',
  fortnightly: 'biweekly',
  monthly: 'monthly',
}

const weekdayMap: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const normalizeCadence = (value?: string | null): PayoutCadence => {
  if (!value) return DEFAULT_PAYOUT_CADENCE
  const normalized = value.trim().toLowerCase()
  return cadenceMap[normalized] || DEFAULT_PAYOUT_CADENCE
}

const normalizeWeekday = (value?: string | null): number => {
  if (!value) return weekdayMap[DEFAULT_PAYOUT_DAY.toLowerCase()]
  const normalized = value.trim().toLowerCase()
  return weekdayMap[normalized] ?? weekdayMap[DEFAULT_PAYOUT_DAY.toLowerCase()]
}

const setPayoutTime = (date: Date) => {
  const next = new Date(date)
  next.setHours(DEFAULT_PAYOUT_HOUR, 0, 0, 0)
  return next
}

const nextWeekdayOnOrAfter = (from: Date, weekday: number) => {
  const base = new Date(from)
  base.setHours(0, 0, 0, 0)
  const current = base.getDay()
  const diff = (weekday - current + 7) % 7
  const result = new Date(base)
  result.setDate(base.getDate() + diff)
  return setPayoutTime(result)
}

const nextMonthlyWeekday = (from: Date, weekday: number) => {
  const firstOfNextMonth = new Date(from.getFullYear(), from.getMonth() + 1, 1)
  return nextWeekdayOnOrAfter(firstOfNextMonth, weekday)
}

export const getNextPayoutDate = ({
  cadence,
  payoutDay,
  from = new Date(),
}: {
  cadence?: string | null
  payoutDay?: string | null
  from?: Date
}) => {
  const normalizedCadence = normalizeCadence(cadence)
  const weekday = normalizeWeekday(payoutDay)
  if (normalizedCadence === 'monthly') {
    return nextMonthlyWeekday(from, weekday)
  }
  const offsetDays = normalizedCadence === 'biweekly' ? 14 : 7
  const anchor = new Date(from)
  anchor.setDate(anchor.getDate() + offsetDays)
  return nextWeekdayOnOrAfter(anchor, weekday)
}
