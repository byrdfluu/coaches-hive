const BILLING_TIMEZONE = 'America/New_York'
const DEFAULT_TRIAL_CHARGE_HOUR = 9

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const zonedFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BILLING_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const getZonedParts = (date: Date, timeZone = BILLING_TIMEZONE): ZonedParts => {
  const formatter = timeZone === BILLING_TIMEZONE
    ? zonedFormatter
    : new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })

  const parts = formatter.formatToParts(date)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || '0')
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

const resolveLocalTimeToUtcTimestamp = (target: ZonedParts, timeZone = BILLING_TIMEZONE) => {
  let guess = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  )

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const actual = getZonedParts(new Date(guess), timeZone)
    const diffMs =
      Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second) -
      Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)

    if (diffMs === 0) {
      return Math.floor(guess / 1000)
    }
    guess += diffMs
  }

  return Math.floor(guess / 1000)
}

export const getTrialChargeTimestamp = ({
  now = new Date(),
  trialDays,
  timeZone = BILLING_TIMEZONE,
  chargeHourLocal = DEFAULT_TRIAL_CHARGE_HOUR,
}: {
  now?: Date
  trialDays: number
  timeZone?: string
  chargeHourLocal?: number
}) => {
  const localNow = getZonedParts(now, timeZone)
  const localDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day))
  localDate.setUTCDate(localDate.getUTCDate() + trialDays + 1)

  return resolveLocalTimeToUtcTimestamp(
    {
      year: localDate.getUTCFullYear(),
      month: localDate.getUTCMonth() + 1,
      day: localDate.getUTCDate(),
      hour: chargeHourLocal,
      minute: 0,
      second: 0,
    },
    timeZone,
  )
}

export const BILLING_TRIAL_TIMEZONE = BILLING_TIMEZONE
export const BILLING_TRIAL_CHARGE_HOUR = DEFAULT_TRIAL_CHARGE_HOUR
