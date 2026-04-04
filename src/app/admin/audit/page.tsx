'use client'

import { useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type AuditRow = {
  id: string
  actor_email?: string | null
  action: string
  target_type?: string | null
  target_id?: string | null
  metadata?: Record<string, any> | null
  created_at?: string | null
}

const formatTimestamp = (value?: string | null) => {
  if (!value) return 'Unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [exporting, setExporting] = useState(false)
  const [filterKey, setFilterKey] = useState('all')

  useEffect(() => {
    let active = true
    const loadLogs = async () => {
      setLoading(true)
      setNotice('')
      const params = new URLSearchParams()
      const filters: Record<string, string[] | null> = {
        all: null,
        role_switch: ['user.role_switch'],
        access: ['admin.set_role', 'admin.set_suspended', 'admin.set_verification_status', 'admin.self_promote'],
        impersonation: ['admin.impersonate.start', 'admin.impersonate.stop'],
        support: ['admin.support.update', 'admin.support.template_used'],
        payouts: ['admin.payouts.update'],
        automations: ['admin.automations.update', 'admin.automation.run'],
        orgs: ['admin.orgs.update'],
        security: ['admin.security.update'],
        reviews: ['admin.review.update'],
        disputes: ['admin.disputes.settings_update'],
        notices: ['admin.notice.create'],
        uptime: ['admin.uptime.update'],
        playbook: ['admin.playbook.update'],
      }
      const actions = filters[filterKey]
      if (actions?.length) {
        params.set('actions', actions.join(','))
      }
      const response = await fetch(`/api/admin/audit${params.toString() ? `?${params.toString()}` : ''}`)
      if (!response.ok) {
        setNotice('Unable to load audit log.')
        setLoading(false)
        return
      }
      const payload = await response.json().catch(() => null)
      if (!active) return
      setLogs((payload?.logs || []) as AuditRow[])
      setLoading(false)
    }
    loadLogs()
    return () => {
      active = false
    }
  }, [filterKey])

  const handleExport = async () => {
    setExporting(true)
    const response = await fetch('/api/admin/audit/export')
    if (!response.ok) {
      setNotice('Unable to export audit log.')
      setExporting(false)
      return
    }
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `admin-audit-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
    setExporting(false)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Admin</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Audit log</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Track admin actions across the platform.</p>
          </div>
          <button
            className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] disabled:opacity-60"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Exporting...' : 'Export audit log'}
          </button>
        </header>
        {notice ? <p className="mt-2 text-sm text-[#b80f0a]">{notice}</p> : null}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="glass-card border border-[#191919] bg-white p-6">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: 'all', label: 'All activity' },
                { key: 'role_switch', label: 'Role switches' },
                { key: 'access', label: 'Access changes' },
                { key: 'impersonation', label: 'Impersonation' },
                { key: 'support', label: 'Support' },
                { key: 'payouts', label: 'Payouts' },
                { key: 'automations', label: 'Automations' },
                { key: 'orgs', label: 'Org updates' },
                { key: 'security', label: 'Security' },
                { key: 'reviews', label: 'Reviews' },
                { key: 'disputes', label: 'Disputes' },
                { key: 'notices', label: 'Notices' },
                { key: 'uptime', label: 'Uptime' },
                { key: 'playbook', label: 'Playbook' },
              ].map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setFilterKey(filter.key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    filterKey === filter.key
                      ? 'bg-[#191919] text-white'
                      : 'border border-[#191919] text-[#191919] hover:bg-[#191919] hover:text-white'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {loading ? (
                <LoadingState label="Loading audit log..." />
              ) : logs.length === 0 ? (
                <EmptyState title="No audit activity yet." description="Admin actions will appear here." />
              ) : (
                <div className="space-y-3 text-sm text-[#191919]">
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4a4a4a]">
                        <span>{formatTimestamp(log.created_at)}</span>
                        <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 uppercase tracking-[0.2em] text-[10px]">
                          {log.action}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[#191919]">
                        {log.actor_email || 'Admin'}
                      </p>
                      <p className="mt-1 text-xs text-[#4a4a4a]">
                        Target: {log.target_type || 'n/a'} {log.target_id ? `· ${log.target_id}` : ''}
                      </p>
                      {log.metadata ? (
                        <pre className="mt-2 whitespace-pre-wrap rounded-2xl border border-[#e2e2e2] bg-white px-3 py-2 text-[11px] text-[#4a4a4a]">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
