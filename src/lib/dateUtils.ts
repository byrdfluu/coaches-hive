const toValidDate = (value: Date | string | number | null | undefined) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (value === null || value === undefined) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const formatShortDate = (value: Date | string | number | null | undefined) => {
  const date = toValidDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const formatMonthYear = (value: Date | string | number | null | undefined) => {
  const date = toValidDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export const formatTime = (value: Date | string | number | null | undefined) => {
  const date = toValidDate(value)
  if (!date) return '—'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export const formatShortDateTime = (value: Date | string | number | null | undefined) => {
  const dateLabel = formatShortDate(value)
  const timeLabel = formatTime(value)
  if (dateLabel === '—' || timeLabel === '—') return '—'
  return `${dateLabel} · ${timeLabel}`
}

export const formatWeekLabel = (value: Date | string | number | null | undefined) => `Week of ${formatShortDate(value)}`

export const addMinutes = (value: Date, minutes: number) => {
  const date = toValidDate(value) || new Date()
  return new Date(date.getTime() + minutes * 60000)
}

export const addDays = (value: Date, days: number) => {
  const date = toValidDate(value) || new Date()
  return new Date(date.getTime() + days * 86400000)
}

export const addMonths = (value: Date, months: number) => {
  const base = toValidDate(value) || new Date()
  const next = new Date(base)
  next.setMonth(next.getMonth() + months)
  return next
}

export const getWeekStart = (value: Date) => {
  const base = toValidDate(value) || new Date()
  const date = new Date(base)
  const day = date.getDay()
  const diff = date.getDate() - ((day + 6) % 7)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export const nextWeekday = (value: Date, targetDay: number) => {
  const current = value.getDay()
  const delta = (targetDay + 7 - current) % 7 || 7
  return addDays(value, delta)
}
