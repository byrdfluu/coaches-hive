'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AdminSidebar from '@/components/AdminSidebar'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'

type UptimeIncident = {
  time: string
  title: string
  detail: string
  source?: 'sentry' | 'operations' | 'manual'
  source_id?: string | null
  source_url?: string | null
}

export default function AdminUptimePage() {
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [uptimeStats, setUptimeStats] = useState<Array<{ label: string; value: string }>>([])
  const [incidents, setIncidents] = useState<UptimeIncident[]>([])
  const [checks, setChecks] = useState<Array<{ id: string; label: string; status: 'up' | 'down'; latency_ms: number | null; detail: string }>>([])
  const [sentryStatus, setSentryStatus] = useState<{ enabled: boolean; last_sync_at: string | null; last_error: string | null; open_issue_count: number } | null>(null)

  useEffect(() => {
    let active = true
    const loadUptime = async () => {
      setLoading(true)
      const response = await fetch('/api/admin/uptime')
      if (!response.ok) {
        setToast('Unable to load uptime data.')
        setLoading(false)
        return
      }
      const payload = await response.json()
      if (!active) return
      setUptimeStats(payload.config?.uptimeStats || [])
      setIncidents(payload.config?.incidents || [])
      setChecks(payload.config?.checks || [])
      setSentryStatus(payload.config?.sentry || null)
      setLoading(false)
    }
    loadUptime()
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div>
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Uptime</p>
                <h1 className="display text-3xl font-semibold text-[#191919]">Platform uptime</h1>
                <p className="mt-2 text-sm text-[#6b5f55]">Live status from health probes and Sentry incidents.</p>
              </div>
              <Link href="/admin" className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
                Back to admin
              </Link>
            </header>

            {loading ? <LoadingState label="Loading uptime..." /> : null}
            <section className="mt-8 grid gap-4 md:grid-cols-3">
              {uptimeStats.map((stat) => (
                <div key={stat.label} className="glass-card rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
              ))}
            </section>

            <section className="mt-8 glass-card rounded-2xl border border-[#dcdcdc] bg-white px-5 py-4">
              <h2 className="text-xl font-semibold text-[#191919]">Probe status</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {checks.map((check) => (
                  <div key={check.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-[#191919]">{check.label}</p>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          check.status === 'up'
                            ? 'border-[#1f6f3c] text-[#1f6f3c]'
                            : 'border-[#b80f0a] text-[#b80f0a]'
                        }`}
                      >
                        {check.status === 'up' ? 'UP' : 'DOWN'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#6b5f55]">{check.detail}</p>
                    <p className="text-[11px] text-[#6b5f55]">
                      Latency {check.latency_ms !== null ? `${check.latency_ms}ms` : '—'}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-[#6b5f55]">
                Sentry {sentryStatus?.enabled ? 'connected' : 'not configured'} · Open issues {sentryStatus?.open_issue_count || 0}
                {sentryStatus?.last_error ? ` · ${sentryStatus.last_error}` : ''}
              </p>
            </section>

            <section className="mt-8 glass-card rounded-2xl border border-[#dcdcdc] bg-white px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[#191919]">Open uptime signals</h2>
                  <p className="mt-1 text-sm text-[#6b5f55]">
                    These are the items counted in the Uptime sidebar badge.
                  </p>
                </div>
                <Link
                  href="/admin/operations"
                  className="rounded-full border border-[#191919] px-3 py-1.5 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-white"
                >
                  Resolve operations incidents
                </Link>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {incidents.length === 0 ? (
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#6b5f55]">
                    No open uptime signals.
                  </div>
                ) : (
                  incidents.map((incident) => (
                    <div key={`${incident.source || 'manual'}-${incident.source_id || incident.time}-${incident.title}`} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#191919]">{incident.title}</p>
                          <p className="mt-1 text-[#6b5f55]">{incident.detail}</p>
                          <p className="mt-1 text-xs text-[#6b5f55]">{incident.time}</p>
                        </div>
                        {incident.source_url ? (
                          <Link
                            href={incident.source_url}
                            target={incident.source_url.startsWith('http') ? '_blank' : undefined}
                            rel={incident.source_url.startsWith('http') ? 'noreferrer' : undefined}
                            className="rounded-full border border-[#191919] px-3 py-1.5 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-white"
                          >
                            {incident.source === 'sentry' ? 'Open in Sentry' : 'Open action'}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}
