import { normalizeCoachTier, type CoachTier } from '@/lib/planRules'

export type CoachPayoutCadence = 'daily' | 'weekly' | 'monthly'
export type StripeWeeklyAnchor =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

const DEFAULT_PAYOUT_HOUR = 9

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const WEEKDAY_ANCHORS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const satisfies readonly StripeWeeklyAnchor[]

export const COACH_PAYOUT_CADENCE_BY_TIER: Record<CoachTier, CoachPayoutCadence> = {
  starter: 'monthly',
  pro: 'weekly',
  elite: 'daily',
}

const COACH_PAYOUT_LABEL_BY_CADENCE: Record<CoachPayoutCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

const toDate = (value?: string | Date | null) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const setPayoutTime = (date: Date) => {
  const next = new Date(date)
  next.setHours(DEFAULT_PAYOUT_HOUR, 0, 0, 0)
  return next
}

const nextWeekdayOnOrAfter = (from: Date, weekday: number) => {
  const base = new Date(from)
  base.setHours(0, 0, 0, 0)
  const diff = (weekday - base.getDay() + 7) % 7
  const result = new Date(base)
  result.setDate(base.getDate() + diff)
  return setPayoutTime(result)
}

const daysInMonth = (year: number, monthIndex: number) => new Date(year, monthIndex + 1, 0).getDate()

const clampDayOfMonth = (year: number, monthIndex: number, targetDay: number) =>
  Math.min(Math.max(targetDay, 1), daysInMonth(year, monthIndex))

const ordinal = (value: number) => {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  const mod10 = value % 10
  if (mod10 === 1) return `${value}st`
  if (mod10 === 2) return `${value}nd`
  if (mod10 === 3) return `${value}rd`
  return `${value}th`
}

export const getCoachPayoutCadence = (tier?: string | null): CoachPayoutCadence =>
  COACH_PAYOUT_CADENCE_BY_TIER[normalizeCoachTier(tier)]

export const getCoachPayoutCadenceLabel = (tier?: string | null) =>
  COACH_PAYOUT_LABEL_BY_CADENCE[getCoachPayoutCadence(tier)]

export const getCoachPayoutAnchorDate = (value?: string | Date | null) => toDate(value) || new Date()

export const getCoachPayoutAnchorLabel = ({
  tier,
  anchorDate,
}: {
  tier?: string | null
  anchorDate?: string | Date | null
}) => {
  const cadence = getCoachPayoutCadence(tier)
  const anchor = getCoachPayoutAnchorDate(anchorDate)
  if (cadence === 'daily') return 'Every day'
  if (cadence === 'weekly') return `Every ${WEEKDAY_LABELS[anchor.getDay()]}`
  return `${ordinal(anchor.getDate())} of each month`
}

export const getNextCoachPayoutDate = ({
  tier,
  anchorDate,
  from = new Date(),
}: {
  tier?: string | null
  anchorDate?: string | Date | null
  from?: Date
}) => {
  const cadence = getCoachPayoutCadence(tier)
  const anchor = getCoachPayoutAnchorDate(anchorDate)

  if (cadence === 'daily') {
    const next = new Date(from)
    next.setDate(next.getDate() + 1)
    return setPayoutTime(next)
  }

  if (cadence === 'weekly') {
    const base = new Date(from)
    base.setDate(base.getDate() + 7)
    return nextWeekdayOnOrAfter(base, anchor.getDay())
  }

  const year = from.getFullYear()
  const monthIndex = from.getMonth() + 1
  const day = clampDayOfMonth(year, monthIndex, anchor.getDate())
  return setPayoutTime(new Date(year, monthIndex, day))
}

export const isCoachPayoutDay = ({
  tier,
  anchorDate,
  date,
}: {
  tier?: string | null
  anchorDate?: string | Date | null
  date: Date
}) => {
  const cadence = getCoachPayoutCadence(tier)
  const anchor = getCoachPayoutAnchorDate(anchorDate)
  if (cadence === 'daily') return true
  if (cadence === 'weekly') return date.getDay() === anchor.getDay()
  const targetDay = clampDayOfMonth(date.getFullYear(), date.getMonth(), anchor.getDate())
  return date.getDate() === targetDay
}

export const getStripePayoutScheduleForCoach = ({
  tier,
  anchorDate,
}: {
  tier?: string | null
  anchorDate?: string | Date | null
}) => {
  const cadence = getCoachPayoutCadence(tier)
  const anchor = getCoachPayoutAnchorDate(anchorDate)
  if (cadence === 'daily') {
    return { interval: 'daily' as const }
  }
  if (cadence === 'weekly') {
    return {
      interval: 'weekly' as const,
      weekly_anchor: WEEKDAY_ANCHORS[anchor.getDay()],
    }
  }
  return {
    interval: 'monthly' as const,
    monthly_anchor: anchor.getDate(),
  }
}
