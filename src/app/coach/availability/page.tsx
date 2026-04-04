'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import CoachSidebar from '@/components/CoachSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'

type AvailabilityRow = {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  specific_date?: string | null
  session_type?: string | null
  location?: string | null
  timezone?: string | null
}

type TimeField = 'startTime' | 'endTime'
type TimePart = 'hour' | 'minute' | 'meridiem'
type Meridiem = 'AM' | 'PM'

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const sessionTypes = ['1:1', 'Group', 'Camp']
const hourOptions = Array.from({ length: 12 }, (_, index) => String(index + 1))
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))

function parseTimeParts(value: string): { hour: string; minute: string; meridiem: Meridiem } {
  const [rawHour = '0', rawMinute = '00'] = value.split(':')
  const normalizedHour = Number.parseInt(rawHour, 10)
  const normalizedMinute = Number.parseInt(rawMinute, 10)
  const hour = Number.isNaN(normalizedHour) ? 12 : normalizedHour % 12 || 12
  const minute = Number.isNaN(normalizedMinute) ? '00' : String(normalizedMinute).padStart(2, '0')
  return {
    hour: String(hour),
    minute,
    meridiem: normalizedHour >= 12 ? 'PM' : 'AM',
  }
}

function formatTimeValue(hour: string, minute: string, meridiem: Meridiem) {
  const parsedHour = Number.parseInt(hour, 10)
  const parsedMinute = Number.parseInt(minute, 10)
  if (Number.isNaN(parsedHour) || Number.isNaN(parsedMinute)) {
    return '00:00'
  }
  let hour24 = parsedHour % 12
  if (meridiem === 'PM') hour24 += 12
  return `${String(hour24).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}`
}

function createDefaultFormData() {
  return {
    day: 'Mon',
    mode: 'weekly',
    date: '',
    startTime: '17:00',
    endTime: '18:00',
    allDay: false,
    sessionType: '1:1',
    location: '',
    notifyMessage: '',
  }
}

export default function AvailabilityPage() {
  const [availability, setAvailability] = useState<AvailabilityRow[]>([])
  const [linkedAthleteCount, setLinkedAthleteCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [formData, setFormData] = useState(createDefaultFormData)

  const loadAvailability = useCallback(async () => {
    setLoading(true)
    const response = await fetch('/api/availability')
    if (!response.ok) {
      setNotice('Could not load availability.')
      setLoading(false)
      return
    }
    const data = await response.json()
    setAvailability((data?.availability || []) as AvailabilityRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAvailability()
  }, [loadAvailability])

  useEffect(() => {
    let active = true
    const loadLinkedAthletes = async () => {
      const response = await fetch('/api/memberships')
      if (!response.ok) return
      const payload = await response.json().catch(() => null)
      if (!active) return
      const links = (Array.isArray(payload?.links) ? payload.links : []) as Array<{ status?: string | null }>
      const activeLinks = links.filter((link) => String(link?.status || '').toLowerCase() === 'active')
      setLinkedAthleteCount(activeLinks.length)
    }
    loadLinkedAthletes()
    return () => {
      active = false
    }
  }, [])

  const handleChange = (field: keyof typeof formData) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleToggle = (field: keyof typeof formData) => () => {
    setFormData((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  const updateTimeField = useCallback((field: TimeField, part: TimePart, value: string) => {
    setFormData((prev) => {
      const currentParts = parseTimeParts(prev[field])
      const nextHour = part === 'hour' ? value : currentParts.hour
      const nextMinute = part === 'minute' ? value : currentParts.minute
      const nextMeridiem = part === 'meridiem' ? (value as Meridiem) : currentParts.meridiem
      return {
        ...prev,
        [field]: formatTimeValue(nextHour, nextMinute, nextMeridiem),
      }
    })
  }, [])

  const resetForm = useCallback(() => {
    setEditingSlotId(null)
    setFormData(createDefaultFormData())
  }, [])

  const formatDateLabel = (value?: string) => {
    if (!value) return ''
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTimeLabel = (value: string) => {
    const [hour, minute] = value.split(':').map((part) => Number.parseInt(part, 10))
    if (Number.isNaN(hour) || Number.isNaN(minute)) return value
    const date = new Date()
    date.setHours(hour, minute, 0, 0)
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const handleEdit = useCallback((slot: AvailabilityRow) => {
    setNotice('')
    setEditingSlotId(slot.id)
    setFormData({
      day: dayLabels[slot.day_of_week] || 'Mon',
      mode: slot.specific_date ? 'date' : 'weekly',
      date: slot.specific_date || '',
      startTime: slot.start_time,
      endTime: slot.end_time,
      allDay: slot.start_time === '00:00' && slot.end_time === '23:59',
      sessionType: slot.session_type === 'group'
        ? 'Group'
        : slot.session_type === 'camp'
          ? 'Camp'
          : '1:1',
      location: slot.location || '',
      notifyMessage: '',
    })
  }, [])

  const handleSave = useCallback(async () => {
    setNotice('')
    let dayIndex = dayLabels.indexOf(formData.day)
    let specificDate: string | null = null
    if (formData.mode === 'date') {
      if (!formData.date) {
        setNotice('Select a specific date.')
        return
      }
      const parsedDate = new Date(`${formData.date}T00:00:00`)
      if (Number.isNaN(parsedDate.getTime())) {
        setNotice('Select a valid date.')
        return
      }
      dayIndex = parsedDate.getDay()
      specificDate = formData.date
    }

    if (dayIndex === -1) {
      setNotice('Select a valid day.')
      return
    }

    const startTime = formData.allDay ? '00:00' : formData.startTime
    const endTime = formData.allDay ? '23:59' : formData.endTime

    const response = await fetch('/api/availability', {
      method: editingSlotId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingSlotId,
        day_of_week: dayIndex,
        start_time: startTime,
        end_time: endTime,
        specific_date: specificDate,
        session_type: formData.sessionType.toLowerCase(),
        location: formData.location,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      setNotice(data?.error || 'Could not save availability.')
      return
    }

    resetForm()
    setNotice(editingSlotId ? 'Availability updated.' : 'Availability saved.')
    setToast(editingSlotId ? 'Slot updated' : 'Save complete')
    await loadAvailability()
  }, [editingSlotId, formData, loadAvailability, resetForm])

  const handleNotifyAthletes = useCallback(async () => {
    setNotifyLoading(true)
    const message = formData.notifyMessage.trim()
      || (formData.mode === 'date' && formData.date
        ? `New availability on ${formatDateLabel(formData.date)}`
        : `New availability on ${formData.day}`)
    const response = await fetch('/api/coach/notify-athletes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'availability',
        message,
      }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setToast(payload?.error || 'Unable to notify athletes')
      setNotifyLoading(false)
      return
    }
    const count = payload?.count || 0
    setToast(count ? `Notified ${count} athletes` : 'No linked athletes to notify')
    setNotifyLoading(false)
  }, [formData])

  const handleDelete = useCallback(async (id: string) => {
    setNotice('')
    const response = await fetch(`/api/availability?id=${id}`, { method: 'DELETE' })
    if (!response.ok) {
      setNotice('Could not remove slot.')
      return
    }
    await loadAvailability()
  }, [loadAvailability])

  const sortedAvailability = useMemo(() => {
    return [...availability].sort((a, b) => {
      if (a.specific_date || b.specific_date) {
        const aDate = a.specific_date ? new Date(a.specific_date).getTime() : Number.POSITIVE_INFINITY
        const bDate = b.specific_date ? new Date(b.specific_date).getTime() : Number.POSITIVE_INFINITY
        if (aDate !== bDate) return aDate - bDate
      }
      if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
      return a.start_time.localeCompare(b.start_time)
    })
  }, [availability])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="coach" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <CoachSidebar />
          <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Availability</p>
                <h1 className="display text-3xl font-semibold text-[#191919]">Set when athletes can book</h1>
                <p className="mt-2 text-sm text-[#4a4a4a]">Choose days, times, and session types for parents/athletes to see.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <Link href="/coach/settings#export-center" className="self-start rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
                  Go to export center
                </Link>
                <Link href="/coach/calendar" className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#f5f5f5]">
                  Back to calendar
                </Link>
              </div>
            </header>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-xl font-semibold text-[#191919]">Current slots</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm text-[#4a4a4a]">
                {loading ? (
                  <LoadingState label="Loading availability..." />
                ) : sortedAvailability.length === 0 ? (
                  <EmptyState title="No availability yet." description="Add your first block so athletes can book." />
                ) : (
                  sortedAvailability.map((slot) => (
                    <div key={slot.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-[#191919]">
                            {dayLabels[slot.day_of_week]}
                            {slot.specific_date ? ` · ${formatDateLabel(slot.specific_date)}` : ''}
                          </p>
                          <p>{formatTimeLabel(slot.start_time)} - {formatTimeLabel(slot.end_time)}</p>
                          <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">{slot.session_type || 'Session'}</p>
                          {slot.location && <p className="text-xs text-[#4a4a4a]">{slot.location}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(slot)}
                            className="text-xs font-semibold text-[#191919]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(slot.id)}
                            className="text-xs font-semibold text-[#b80f0a]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-[#191919]">
                  {editingSlotId ? 'Edit availability' : 'Add availability'}
                </h2>
                {editingSlotId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
              <form className="mt-4 grid gap-4 md:grid-cols-2 text-sm" onSubmit={(event) => event.preventDefault()}>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Day</label>
                  <div className="grid gap-2">
                    <div className="flex gap-2">
                      {[
                        { value: 'weekly', label: 'Weekly' },
                        { value: 'date', label: 'Specific date' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, mode: option.value }))}
                          className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold ${
                            formData.mode === option.value ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {formData.mode === 'weekly' ? (
                      <select
                        value={formData.day}
                        onChange={handleChange('day')}
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                      >
                        {dayLabels.map((day) => (
                          <option key={day}>{day}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="date"
                          value={formData.date}
                          onChange={handleChange('date')}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                        />
                        {formData.date ? (
                          <p className="text-xs text-[#4a4a4a]">
                            {dayLabels[new Date(`${formData.date}T00:00:00`).getDay()]} · {formatDateLabel(formData.date)}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Time window</label>
                  <div className="grid gap-3">
                    {(['startTime', 'endTime'] as TimeField[]).map((field) => {
                      const parts = parseTimeParts(formData.allDay ? (field === 'startTime' ? '00:00' : '23:59') : formData[field])
                      return (
                        <div key={field} className="space-y-2">
                          <p className="text-xs font-semibold text-[#4a4a4a]">{field === 'startTime' ? 'Start' : 'End'}</p>
                          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                            <select
                              value={parts.hour}
                              onChange={(event) => updateTimeField(field, 'hour', event.target.value)}
                              disabled={formData.allDay}
                              className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919] disabled:bg-[#f5f5f5]"
                            >
                              {hourOptions.map((hour) => (
                                <option key={hour} value={hour}>
                                  {hour}
                                </option>
                              ))}
                            </select>
                            <select
                              value={parts.minute}
                              onChange={(event) => updateTimeField(field, 'minute', event.target.value)}
                              disabled={formData.allDay}
                              className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919] disabled:bg-[#f5f5f5]"
                            >
                              {minuteOptions.map((minute) => (
                                <option key={minute} value={minute}>
                                  {minute}
                                </option>
                              ))}
                            </select>
                            <select
                              value={parts.meridiem}
                              onChange={(event) => updateTimeField(field, 'meridiem', event.target.value)}
                              disabled={formData.allDay}
                              className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919] disabled:bg-[#f5f5f5]"
                            >
                              <option value="AM">AM</option>
                              <option value="PM">PM</option>
                            </select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={handleToggle('allDay')}
                    className={`w-full rounded-full border px-3 py-2 text-xs font-semibold ${
                      formData.allDay ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
                    }`}
                  >
                    {formData.allDay ? 'All day availability' : 'Set as all day'}
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Session type</label>
                  <select
                    value={formData.sessionType}
                    onChange={handleChange('sessionType')}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                  >
                    {sessionTypes.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Location</label>
                  <input
                    value={formData.location}
                    onChange={handleChange('location')}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="Facility or link"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-semibold text-[#4a4a4a]">Notification message</label>
                  <textarea
                    value={formData.notifyMessage}
                    onChange={(event) => setFormData((prev) => ({ ...prev, notifyMessage: event.target.value }))}
                    rows={3}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-[#191919] outline-none focus:border-[#191919]"
                    placeholder="Optional. Add a message to send with this availability update."
                  />
                  <p className="text-xs text-[#4a4a4a]">
                    Leave this blank to send the default availability update.
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-2 text-xs text-[#4a4a4a]">
                    <span>
                      {linkedAthleteCount === 1
                        ? 'This will notify 1 linked athlete.'
                        : `This will notify ${linkedAthleteCount} linked athletes.`}
                    </span>
                    <Link href="/coach/athletes" className="font-semibold text-[#191919] underline decoration-[#191919]/30 decoration-2 underline-offset-4">
                      Manage linked athletes
                    </Link>
                  </div>
                </div>
                {notice && (
                  <p className="md:col-span-2 text-xs text-[#4a4a4a]">{notice}</p>
                )}
                <div className="md:col-span-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b80f0a]"
                  >
                    {editingSlotId ? 'Update slot' : 'Save slot'}
                  </button>
                  <button
                    type="button"
                    onClick={handleNotifyAthletes}
                    disabled={notifyLoading}
                    className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                  >
                    {notifyLoading ? 'Notifying...' : 'Notify athletes'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
