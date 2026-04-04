'use client'

import { useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type RetentionPolicy = {
  id?: string
  table_name: string
  date_column?: string | null
  retention_days: number
  enabled: boolean
}

type BackupPolicy = {
  provider: string
  frequency: string
  retention_days: number
  status: string
  notes?: string | null
}

export default function AdminRetentionPage() {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([])
  const [backup, setBackup] = useState<BackupPolicy>({
    provider: 'supabase',
    frequency: 'daily',
    retention_days: 30,
    status: 'unverified',
    notes: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState('')
  const [runNotice, setRunNotice] = useState('')

  useEffect(() => {
    let active = true
    const loadRetention = async () => {
      setLoading(true)
      const response = await fetch('/api/admin/retention')
      if (!response.ok) {
        setNotice('Unable to load retention settings.')
        setLoading(false)
        return
      }
      const payload = await response.json()
      if (!active) return
      setPolicies(payload.policies || [])
      if (payload.backup) {
        setBackup({
          provider: payload.backup.provider || 'supabase',
          frequency: payload.backup.frequency || 'daily',
          retention_days: payload.backup.retention_days || 30,
          status: payload.backup.status || 'unverified',
          notes: payload.backup.notes || '',
        })
      }
      setLoading(false)
    }
    loadRetention()
    return () => {
      active = false
    }
  }, [])

  const sortedPolicies = useMemo(
    () => [...policies].sort((a, b) => a.table_name.localeCompare(b.table_name)),
    [policies]
  )

  const updatePolicy = (tableName: string, updates: Partial<RetentionPolicy>) => {
    setPolicies((prev) =>
      prev.map((policy) =>
        policy.table_name === tableName ? { ...policy, ...updates } : policy
      )
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setNotice('')
    const response = await fetch('/api/admin/retention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policies, backup }),
    })
    if (!response.ok) {
      setNotice('Unable to save retention settings.')
      setSaving(false)
      return
    }
    const payload = await response.json()
    setPolicies(payload.policies || policies)
    if (payload.backup) {
      setBackup({
        provider: payload.backup.provider || backup.provider,
        frequency: payload.backup.frequency || backup.frequency,
        retention_days: payload.backup.retention_days || backup.retention_days,
        status: payload.backup.status || backup.status,
        notes: payload.backup.notes || backup.notes,
      })
    }
    setNotice('Retention settings saved.')
    setSaving(false)
  }

  const handleRun = async () => {
    setRunning(true)
    setRunNotice('')
    const response = await fetch('/api/admin/retention/run', { method: 'POST' })
    if (!response.ok) {
      setRunNotice('Unable to run retention cleanup.')
      setRunning(false)
      return
    }
    const payload = await response.json()
    const summary = (payload.results || [])
      .map((row: { table: string; deleted: number }) => `${row.table}: ${row.deleted}`)
      .join(', ')
    setRunNotice(summary || 'Retention cleanup completed.')
    setRunning(false)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Admin</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Backups & retention</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Configure backup expectations and data retention windows.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] disabled:opacity-60"
              onClick={handleRun}
              disabled={running || loading}
            >
              {running ? 'Running...' : 'Run retention cleanup'}
            </button>
            <button
              type="button"
              className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={handleSave}
              disabled={saving || loading}
            >
              {saving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </header>
        {notice ? <p className="mt-2 text-sm text-[#b80f0a]">{notice}</p> : null}
        {runNotice ? <p className="mt-2 text-sm text-[#4a4a4a]">{runNotice}</p> : null}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Backup policy</h2>
              <p className="mt-1 text-sm text-[#4a4a4a]">
                Track the backup setup you configure in Supabase or your hosting provider.
              </p>
              <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Provider</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={backup.provider}
                    onChange={(event) => setBackup((prev) => ({ ...prev, provider: event.target.value }))}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Frequency</span>
                  <input
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={backup.frequency}
                    onChange={(event) => setBackup((prev) => ({ ...prev, frequency: event.target.value }))}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Retention days</span>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={backup.retention_days}
                    onChange={(event) => setBackup((prev) => ({ ...prev, retention_days: Number(event.target.value) }))}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Status</span>
                  <select
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    value={backup.status}
                    onChange={(event) => setBackup((prev) => ({ ...prev, status: event.target.value }))}
                  >
                    <option value="unverified">Unverified</option>
                    <option value="active">Active</option>
                    <option value="needs_review">Needs review</option>
                  </select>
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Notes</span>
                  <textarea
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                    rows={3}
                    value={backup.notes || ''}
                    onChange={(event) => setBackup((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </label>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Data retention policies</h2>
              <p className="mt-1 text-sm text-[#4a4a4a]">
                Control how long data is retained before cleanup runs.
              </p>
              {loading ? (
                <LoadingState label="Loading policies..." className="mt-4" />
              ) : (
                <div className="mt-4 space-y-3 text-sm">
                  {sortedPolicies.length === 0 ? (
                    <EmptyState title="No retention policies configured." description="Add a policy to control data cleanup." />
                  ) : (
                    sortedPolicies.map((policy) => (
                      <div key={policy.table_name} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[#191919]">{policy.table_name}</p>
                            <p className="text-xs text-[#4a4a4a]">
                              Date column: {policy.date_column || 'created_at'}
                            </p>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-[#4a4a4a]">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={policy.enabled}
                              onChange={(event) =>
                                updatePolicy(policy.table_name, { enabled: event.target.checked })
                              }
                            />
                            Enabled
                          </label>
                        </div>
                        <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                          <label className="space-y-1">
                            <span className="text-xs font-semibold text-[#4a4a4a]">Retention days</span>
                            <input
                              type="number"
                              min={1}
                              className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                              value={policy.retention_days}
                              onChange={(event) =>
                                updatePolicy(policy.table_name, { retention_days: Number(event.target.value) })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
