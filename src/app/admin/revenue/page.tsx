'use client'

import { useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type RevenueDay = {
  date: string
  total: number
}

type RevenueBreakdown = {
  id: string
  name: string
  revenue: number
  sessionFees?: number
  marketplaceFees?: number
  sessionCount?: number
  tier?: string
}

type RevenueHour = {
  hour: number
  total: number
}

type RevenuePayload = {
  month: string
  totals: {
    platform: number
    marketplace: number
    orgFees: number
    sessionFees?: number
  }
  sources?: {
    marketplaceFees: number
    orgFees: number
    grossMarketplaceSales: number
    refunds: number
    sessionFees?: number
  }
  days: RevenueDay[]
  hours?: RevenueHour[]
  byCoach: RevenueBreakdown[]
  byOrg: RevenueBreakdown[]
  byAthlete: RevenueBreakdown[]
  churn?: {
    logoChurnRate: number
    revenueChurnRate: number
    netRevenueRetention: number
    atRiskOrgs: number
    windowDays: number
    riskWindowDays: number
  }
  alerts?: Array<{ id: string; title: string; detail: string; severity: 'High' | 'Medium' | 'Low' }>
}

const formatCurrency = (value: number) => {
  if (!Number.isFinite(value)) return '$0'
  return `$${value.toFixed(2).replace(/\\.00$/, '')}`
}

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatMonthLabel = (value: string) => {
  const [year, month] = value.split('-').map((part) => Number(part))
  if (!year || !month) return value
  const date = new Date(Date.UTC(year, month - 1, 1))
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const addMonths = (value: string, offset: number) => {
  const [year, month] = value.split('-').map((part) => Number(part))
  if (!year || !month) return value
  const date = new Date(Date.UTC(year, month - 1, 1))
  date.setUTCMonth(date.getUTCMonth() + offset)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const getCurrentMonthValue = () => new Date().toISOString().slice(0, 7)

const buildLine = (values: number[]) => {
  if (values.length === 0) return ''
  const max = Math.max(...values, 1)
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100
      const y = 38 - (value / max) * 32
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

export default function AdminRevenuePage() {
  const [month, setMonth] = useState('')
  const [data, setData] = useState<RevenuePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [monthlyAnchor, setMonthlyAnchor] = useState('')
  const [monthlyData, setMonthlyData] = useState<Record<string, RevenuePayload>>({})
  const [monthlyLoading, setMonthlyLoading] = useState(true)
  const [monthlyNotice, setMonthlyNotice] = useState('')
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [detailView, setDetailView] = useState<'summary' | 'daily'>('summary')
  const [selectedDay, setSelectedDay] = useState('')
  const [feeTab, setFeeTab] = useState<'coach' | 'org'>('coach')
  const [feeSearch, setFeeSearch] = useState('')
  const [selectedFeeEntry, setSelectedFeeEntry] = useState<RevenueBreakdown | null>(null)

  useEffect(() => {
    const currentMonth = getCurrentMonthValue()
    setMonth((prev) => prev || currentMonth)
    setMonthlyAnchor((prev) => prev || currentMonth)
  }, [])

  useEffect(() => {
    if (!month) return
    let active = true
    const loadRevenue = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch(`/api/admin/revenue?month=${month}`)
      if (!response.ok) {
        if (active) {
          setNotice('Unable to load revenue.')
          setLoading(false)
        }
        return
      }
      const payload = await response.json()
      if (!active) return
      setData(payload)
      setLoading(false)
    }
    loadRevenue()
    return () => {
      active = false
    }
  }, [month])

  const monthlyMonths = useMemo(() => {
    if (!monthlyAnchor) return []
    return [monthlyAnchor, addMonths(monthlyAnchor, -1), addMonths(monthlyAnchor, -2)]
  }, [monthlyAnchor])

  useEffect(() => {
    if (monthlyMonths.length === 0) return
    let active = true
    const loadMonthlyRevenue = async () => {
      setMonthlyLoading(true)
      setMonthlyNotice('')
      const results = await Promise.allSettled(
        monthlyMonths.map(async (value) => {
          const response = await fetch(`/api/admin/revenue?month=${value}`)
          if (!response.ok) {
            throw new Error('Unable to load revenue.')
          }
          return response.json()
        })
      )
      if (!active) return
      const nextData: Record<string, RevenuePayload> = {}
      let hasError = false
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          nextData[monthlyMonths[index]] = result.value as RevenuePayload
        } else {
          hasError = true
        }
      })
      setMonthlyData(nextData)
      setMonthlyLoading(false)
      if (hasError) {
        setMonthlyNotice('Some months could not be loaded.')
      }
    }
    loadMonthlyRevenue()
    return () => {
      active = false
    }
  }, [monthlyMonths])

  const chart = useMemo(() => {
    if (!data) return { actual: '', projected: '' }
    const dailyTotals = data.days.map((day) => day.total)
    let running = 0
    const actual = dailyTotals.map((value) => {
      running += value
      return running
    })
    const today = new Date()
    const currentMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`
    const isCurrent = data.month === currentMonth
    const daysElapsed = isCurrent ? Math.min(today.getUTCDate(), dailyTotals.length) : dailyTotals.length
    const actualSoFar = actual[Math.max(daysElapsed - 1, 0)] || 0
    const avg = daysElapsed ? actualSoFar / daysElapsed : 0
    const projected = dailyTotals.map((_, index) => (isCurrent ? avg * (index + 1) : actual[index]))
    return { actual: buildLine(actual), projected: buildLine(projected) }
  }, [data])

  useEffect(() => {
    setSelectedDay('')
  }, [selectedMonth, detailView])

  const churnStats = [
    {
      label: 'Logo churn',
      value: `${Number(data?.churn?.logoChurnRate || 0).toFixed(1)}%`,
      detail: `${data?.churn?.windowDays || 30}-day view`,
    },
    {
      label: 'Revenue churn',
      value: `${Number(data?.churn?.revenueChurnRate || 0).toFixed(1)}%`,
      detail: `${data?.churn?.windowDays || 30}-day view`,
    },
    {
      label: 'Net revenue retention',
      value: `${Number(data?.churn?.netRevenueRetention || 0).toFixed(1)}%`,
      detail: `${data?.churn?.windowDays || 30}-day view`,
    },
    {
      label: 'At-risk orgs',
      value: String(Number(data?.churn?.atRiskOrgs || 0)),
      detail: `Last ${data?.churn?.riskWindowDays || 14} days`,
    },
  ]

  const filteredFeeData = useMemo(() => {
    const source = feeTab === 'coach' ? (data?.byCoach || []) : (data?.byOrg || [])
    if (!feeSearch.trim()) return source
    const q = feeSearch.toLowerCase()
    return source.filter((entry) => entry.name.toLowerCase().includes(q))
  }, [feeTab, feeSearch, data])

  const alertItems = data?.alerts || []

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Platform revenue</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">All revenue streams across marketplace fees and org charges.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Monthly performance</h2>
                  <p className="text-sm text-[#6b5f55]">Track platform revenue and projections.</p>
                </div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#6b5f55]">
                  <span>Month</span>
                  <input
                    type="month"
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                    className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-sm text-[#191919]"
                  />
                </div>
              </div>
              {notice ? <p className="mt-3 text-xs text-[#6b5f55]">{notice}</p> : null}
              {loading ? (
                <LoadingState label="Loading revenue..." className="mt-4" />
              ) : (
                <>
                  <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                    <svg viewBox="0 0 100 40" className="h-32 w-full">
                      <polyline fill="none" stroke="#191919" strokeWidth="1.5" points={chart.actual} />
                      <polyline fill="none" stroke="#b80f0a" strokeWidth="1.5" strokeDasharray="3 3" points={chart.projected} />
                    </svg>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#6b5f55]">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-6 rounded-full bg-[#191919]" />
                        Actual
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-6 rounded-full bg-[#b80f0a]" />
                        Projection
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: 'Platform revenue', value: formatCurrency(data?.totals.platform || 0) },
                      { label: 'Session fees', value: formatCurrency(data?.totals.sessionFees || 0) },
                      { label: 'Marketplace fees', value: formatCurrency(data?.totals.marketplace || 0) },
                      { label: 'Org fees', value: formatCurrency(data?.totals.orgFees || 0) },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                        <p className="mt-2 text-xl font-semibold text-[#191919]">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[#191919]">Monthly revenue</h2>
                    <p className="mt-1 text-sm text-[#6b5f55]">Current month and the two previous months.</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#6b5f55]">
                    <span>Anchor month</span>
                    <input
                      type="month"
                      value={monthlyAnchor}
                      onChange={(event) => setMonthlyAnchor(event.target.value)}
                      className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-sm text-[#191919]"
                    />
                  </div>
                </div>
                {monthlyNotice ? <p className="mt-3 text-xs text-[#6b5f55]">{monthlyNotice}</p> : null}
                <div className="mt-4 space-y-4 text-sm">
                  {monthlyLoading ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#6b5f55]">
                      Loading months...
                    </div>
                  ) : (
                    monthlyMonths.map((monthValue) => {
                      const monthData = monthlyData[monthValue]
                      const monthTotal = monthData?.days.reduce((sum, day) => sum + day.total, 0) || 0
                      return (
                        <button
                          key={monthValue}
                          type="button"
                          onClick={() => {
                            setSelectedMonth(monthValue)
                            setDetailView('summary')
                          }}
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-left transition hover:border-[#191919]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{formatMonthLabel(monthValue)}</p>
                              <p className="mt-1 text-xs text-[#6b5f55]">Total {formatCurrency(monthTotal)}</p>
                            </div>
                            <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                              View breakdown
                            </span>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="space-y-6">
                {[
                  { title: 'Top coaches', data: data?.byCoach || [] },
                  { title: 'Top orgs', data: data?.byOrg || [] },
                  { title: 'Top athletes', data: data?.byAthlete || [] },
                ].map((section) => (
                  <div key={section.title} className="glass-card border border-[#191919] bg-white p-6">
                    <h3 className="text-lg font-semibold text-[#191919]">{section.title}</h3>
                    <div className="mt-3 space-y-2 text-sm">
                      {loading ? (
                        <LoadingState label="Loading breakdown..." />
                      ) : section.data.length ? (
                        section.data.map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                            <span>{entry.name}</span>
                            <span className="font-semibold text-[#191919]">{formatCurrency(entry.revenue)}</span>
                          </div>
                        ))
                      ) : (
                        <EmptyState title="No revenue recorded." description="Data will appear once transactions are recorded." />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[#191919]">Churn snapshot</h2>
                    <p className="text-sm text-[#6b5f55]">Early signals for retention and revenue risk.</p>
                  </div>
                  <span className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                    Alerts on
                  </span>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {churnStats.map((stat) => (
                    <div key={stat.label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                      <p className="mt-2 text-xl font-semibold text-[#191919]">{stat.value}</p>
                      <p className="mt-1 text-xs text-[#6b5f55]">{stat.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="text-lg font-semibold text-[#191919]">Alerts</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">Revenue and churn notifications that need attention.</p>
                <div className="mt-4 space-y-3 text-sm">
                  {alertItems.length ? (
                    alertItems.map((alert) => (
                      <div key={alert.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-[#191919]">{alert.title}</p>
                          <span className="rounded-full border border-[#191919] px-2 py-1 text-[11px] font-semibold text-[#191919]">
                            {alert.severity}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#6b5f55]">{alert.detail}</p>
                      </div>
                    ))
                  ) : (
                    <EmptyState title="No alerts right now." description="You're all clear for this period." />
                  )}
                </div>
              </div>
            </section>
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Fee analytics</h2>
                  <p className="text-sm text-[#6b5f55]">Platform fees collected per coach and org — includes session booking fees and marketplace commissions.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setFeeTab('coach'); setFeeSearch('') }}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${feeTab === 'coach' ? 'bg-[#191919] text-white' : 'border border-[#dcdcdc] text-[#6b5f55] hover:border-[#191919]'}`}
                  >
                    Coaches
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFeeTab('org'); setFeeSearch('') }}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${feeTab === 'org' ? 'bg-[#191919] text-white' : 'border border-[#dcdcdc] text-[#6b5f55] hover:border-[#191919]'}`}
                  >
                    Orgs
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <input
                  type="text"
                  placeholder={`Search ${feeTab === 'coach' ? 'coaches' : 'orgs'}…`}
                  value={feeSearch}
                  onChange={(e) => setFeeSearch(e.target.value)}
                  className="w-full rounded-full border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                />
              </div>
              <div className="mt-4 space-y-2 text-sm">
                {loading ? (
                  <LoadingState label="Loading fee data..." />
                ) : filteredFeeData.length === 0 ? (
                  <EmptyState title="No fee data." description="Fees will appear once transactions are processed." />
                ) : (
                  filteredFeeData.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedFeeEntry(entry)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-left transition hover:border-[#191919]"
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ececec] text-xs font-bold text-[#191919]">
                        {entry.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[#191919]">{entry.name}</p>
                        {feeTab === 'coach' && entry.tier && (
                          <p className="text-xs capitalize text-[#6b5f55]">{entry.tier} tier</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-[#191919]">{formatCurrency(entry.revenue)}</p>
                        <p className="text-xs text-[#6b5f55]">{entry.sessionCount || 0} sessions</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {selectedFeeEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">
                  {feeTab === 'coach' ? 'Coach breakdown' : 'Org breakdown'}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-[#191919]">{selectedFeeEntry.name}</h2>
                {feeTab === 'coach' && selectedFeeEntry.tier && (
                  <p className="mt-1 text-sm capitalize text-[#6b5f55]">{selectedFeeEntry.tier} plan</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedFeeEntry(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Total fees', value: formatCurrency(selectedFeeEntry.revenue) },
                { label: 'Session fees', value: formatCurrency(selectedFeeEntry.sessionFees || 0) },
                { label: 'Marketplace fees', value: formatCurrency(selectedFeeEntry.marketplaceFees || 0) },
                { label: 'Sessions booked', value: String(selectedFeeEntry.sessionCount || 0) },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold text-[#191919]">{item.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-[#9a9a9a]">Data reflects the currently selected month.</p>
          </div>
        </div>
      )}

      {selectedMonth ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Monthly breakdown</p>
                <h2 className="mt-2 text-2xl font-semibold">{formatMonthLabel(selectedMonth)}</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">
                  Total {formatCurrency(monthlyData[selectedMonth]?.days.reduce((sum, day) => sum + day.total, 0) || 0)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMonth(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                x
              </button>
            </div>
            {!monthlyData[selectedMonth] ? (
              <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#6b5f55]">
                Loading breakdown...
              </div>
            ) : (
              <>
                <div className="mt-4 flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-[#6b5f55]">
                  <span>View</span>
                  <select
                    value={detailView}
                    onChange={(event) => setDetailView(event.target.value as 'summary' | 'daily')}
                    className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-sm text-[#191919]"
                  >
                    <option value="summary">Summary</option>
                    <option value="daily">Day-by-day</option>
                  </select>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    { label: 'Marketplace fees', value: formatCurrency(monthlyData[selectedMonth]?.sources?.marketplaceFees || 0) },
                    { label: 'Org fees', value: formatCurrency(monthlyData[selectedMonth]?.sources?.orgFees || 0) },
                    { label: 'Gross marketplace sales', value: formatCurrency(monthlyData[selectedMonth]?.sources?.grossMarketplaceSales || 0) },
                    { label: 'Refunds', value: formatCurrency(monthlyData[selectedMonth]?.sources?.refunds || 0) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{item.label}</p>
                      <p className="mt-1 font-semibold text-[#191919]">{item.value}</p>
                    </div>
                  ))}
                </div>
                {detailView === 'summary' ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    {[
                      { title: 'Top coaches', data: monthlyData[selectedMonth]?.byCoach || [] },
                      { title: 'Top orgs', data: monthlyData[selectedMonth]?.byOrg || [] },
                      { title: 'Top athletes', data: monthlyData[selectedMonth]?.byAthlete || [] },
                    ].map((section) => (
                      <div key={section.title} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                        <h3 className="text-sm font-semibold text-[#191919]">{section.title}</h3>
                        <div className="mt-3 space-y-2 text-xs">
                          {section.data.length ? (
                            section.data.slice(0, 4).map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2">
                                <span>{entry.name}</span>
                                <span className="font-semibold text-[#191919]">{formatCurrency(entry.revenue)}</span>
                              </div>
                            ))
                          ) : (
                            <EmptyState title="No revenue recorded." description="Data will appear once transactions are recorded." />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#6b5f55]">
                      <span>Day</span>
                      <select
                        value={selectedDay}
                        onChange={(event) => setSelectedDay(event.target.value)}
                        className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-sm text-[#191919]"
                      >
                        <option value="">Select day</option>
                        {(monthlyData[selectedMonth]?.days || []).map((day) => (
                          <option key={day.date} value={day.date}>
                            {formatDate(day.date)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      {!monthlyData[selectedMonth]?.days?.length ? (
                        <EmptyState title="No revenue recorded." description="Daily totals will show once transactions are logged." />
                      ) : !selectedDay ? (
                        <EmptyState title="Select a day." description="Choose a day to see daily revenue details." />
                      ) : (
                        monthlyData[selectedMonth].days
                          .filter((day) => day.date === selectedDay)
                          .map((day) => (
                            <div key={day.date} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                              <span>{formatDate(day.date)}</span>
                              <span className="font-semibold text-[#191919]">{formatCurrency(day.total)}</span>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
    </main>
  )
}
