'use client'

import { useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type OrgAuditRow = {
  id: string
  org_id?: string | null
  org_name?: string | null
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

export default function AdminOrgAuditPage() {
  const [logs, setLogs] = useState<OrgAuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    const loadLogs = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch('/api/admin/org-audit')
      if (!response.ok) {
        setNotice('Unable to load org audit log.')
        setLoading(false)
        return
      }
      const payload = await response.json().catch(() => null)
      if (!active) return
      setLogs((payload?.logs || []) as OrgAuditRow[])
      setLoading(false)
    }
    loadLogs()
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Admin</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Org activity log</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Track org reminders and notifications across the platform.</p>
          </div>
        </header>
        {notice ? <p className="mt-2 text-sm text-[#b80f0a]">{notice}</p> : null}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="glass-card border border-[#191919] bg-white p-6">
            {loading ? (
              <LoadingState label="Loading org activity..." />
            ) : logs.length === 0 ? (
              <EmptyState title="No org activity yet." description="Org actions will appear here." />
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
                      {log.org_name || log.org_id || 'Organization'}
                    </p>
                    <p className="mt-1 text-xs text-[#4a4a4a]">
                      Actor: {log.actor_email || 'Org admin'}
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
    </main>
  )
}
