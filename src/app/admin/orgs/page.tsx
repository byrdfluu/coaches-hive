'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Link from 'next/link'

type OrgRow = {
  id: string
  name: string | null
  status: string | null
  plan: string | null
  member_count: number
  last_activity_at: string | null
}

type OrgDetail = {
  org: {
    id: string
    name: string
    status: string
    plan: string
    org_type?: string | null
    created_at?: string | null
  }
  member_count: number
  onboarding_status: string
  verification_status: string
  admin_members: Array<{ user_id: string }>
  coach_members: Array<{ user_id: string }>
  teams: Array<{ id: string }>
  fee_paid: number
  fee_unpaid: number
}

const formatDate = (value: string | null) => {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminOrgsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [selectedOrg, setSelectedOrg] = useState<OrgDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailNotice, setDetailNotice] = useState('')
  const [updateNotice, setUpdateNotice] = useState('')

  const planOptions = ['standard', 'growth', 'enterprise']
  const statusOptions = ['Active', 'Pending', 'Suspended']
  const orgTypeOptions = ['school', 'club', 'travel', 'academy', 'organization']

  useEffect(() => {
    let active = true
    const loadOrgs = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch('/api/admin/orgs')
      if (!response.ok) {
        if (active) {
          setNotice('Unable to load organizations.')
          setLoading(false)
        }
        return
      }
      const payload = await response.json()
      if (!active) return
      setOrgs((payload.orgs || []) as OrgRow[])
      setLoading(false)
    }
    loadOrgs()
    return () => {
      active = false
    }
  }, [])

  const openOrg = useCallback(async (orgId: string) => {
    setSelectedOrgId(orgId)
    setSelectedOrg(null)
    setDetailLoading(true)
    setDetailNotice('')
    const response = await fetch(`/api/admin/orgs/${orgId}`)
    if (!response.ok) {
      setDetailNotice('Unable to load organization details.')
      setDetailLoading(false)
      return
    }
    const payload = await response.json()
    setSelectedOrg(payload)
    setDetailLoading(false)
  }, [])

  const updateOrg = useCallback(async (orgId: string, updates: { status?: string; plan?: string; org_type?: string }) => {
    setUpdateNotice('')
    const response = await fetch(`/api/admin/orgs/${orgId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!response.ok) {
      setUpdateNotice('Unable to update organization.')
      return
    }
    setUpdateNotice('Organization updated.')
    if (selectedOrg) {
      setSelectedOrg({
        ...selectedOrg,
        org: {
          ...selectedOrg.org,
          status: updates.status || selectedOrg.org.status,
          plan: updates.plan || selectedOrg.org.plan,
          org_type: updates.org_type || selectedOrg.org.org_type,
        },
      })
    }
  }, [selectedOrg])

  const totalOrgs = orgs.length
  const newThisMonth = useMemo(() => {
    const now = new Date()
    return orgs.filter((org) => {
      if (!org.last_activity_at) return false
      const activity = new Date(org.last_activity_at)
      return activity.getMonth() === now.getMonth() && activity.getFullYear() === now.getFullYear()
    }).length
  }, [orgs])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Organizations</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">Review org accounts, onboarding, and activity.</p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-2">
              {[
                { label: 'Total orgs', value: totalOrgs.toString() },
                { label: 'Active this month', value: newThisMonth.toString() },
              ].map((stat) => (
                <div key={stat.label} className="glass-card border border-[#191919] bg-white p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                </div>
              ))}
            </section>

            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#191919]">Org accounts</h2>
              </div>
              {notice ? <p className="mt-3 text-xs text-[#6b5f55]">{notice}</p> : null}
              <div className="mt-4 space-y-3 text-sm overflow-x-auto">
                {loading ? (
                  <LoadingState label="Loading organizations..." />
                ) : orgs.length === 0 ? (
                  <EmptyState title="No organizations found." description="Check back once orgs onboard." />
                ) : (
                  <div className="min-w-[720px] space-y-3">
                    <div className="grid gap-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs uppercase tracking-[0.2em] text-[#6b5f55] md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
                      <span>Name</span>
                      <span>Status</span>
                      <span>Plan</span>
                      <span>Members</span>
                      <span>Last activity</span>
                    </div>
                    {orgs.map((org) => (
                      <div
                        key={org.id}
                        className="grid gap-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#191919] md:grid-cols-[2fr_1fr_1fr_1fr_1fr]"
                      >
                        <button
                          type="button"
                          onClick={() => openOrg(org.id)}
                          className="text-left font-semibold text-[#191919] underline decoration-transparent transition hover:decoration-[#191919]"
                        >
                          {org.name || 'Organization'}
                        </button>
                        <span>{org.status || 'Unknown'}</span>
                        <span>{org.plan || 'Not set'}</span>
                        <span>{org.member_count ?? 0}</span>
                        <span className="text-[#6b5f55]">{formatDate(org.last_activity_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {selectedOrgId ? (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Organization</p>
                <h2 className="mt-2 text-2xl font-semibold">{selectedOrg?.org?.name || 'Organization detail'}</h2>
                <p className="mt-1 text-sm text-[#6b5f55]">{selectedOrg?.org?.plan || 'Plan not set'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedOrgId(null)
                  setSelectedOrg(null)
                  setDetailNotice('')
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919]"
                aria-label="Close"
              >
                x
              </button>
            </div>
            {detailNotice ? <p className="mt-3 text-xs text-[#6b5f55]">{detailNotice}</p> : null}
            {updateNotice ? <p className="mt-3 text-xs text-[#6b5f55]">{updateNotice}</p> : null}
            {detailLoading ? (
              <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#6b5f55]">
                Loading organization...
              </div>
            ) : selectedOrg ? (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    { label: 'Status', value: selectedOrg.org.status || 'Unknown' },
                    { label: 'Members', value: selectedOrg.member_count?.toString() || '0' },
                    { label: 'Onboarding', value: selectedOrg.onboarding_status || 'Not started' },
                    { label: 'Verification', value: selectedOrg.verification_status || 'Not set' },
                    { label: 'Admin members', value: selectedOrg.admin_members?.length?.toString() || '0' },
                    { label: 'Coach members', value: selectedOrg.coach_members?.length?.toString() || '0' },
                    { label: 'Teams', value: selectedOrg.teams?.length?.toString() || '0' },
                    { label: 'Fees paid', value: selectedOrg.fee_paid?.toString() || '0' },
                    { label: 'Fees unpaid', value: selectedOrg.fee_unpaid?.toString() || '0' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{item.label}</p>
                      <p className="mt-1 font-semibold text-[#191919]">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/orgs/${selectedOrg.org.id}`}
                    className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                  >
                    View full profile
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="space-y-2 text-xs">
                    <span className="text-xs font-semibold text-[#6b5f55]">Status</span>
                    <select
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      value={selectedOrg.org.status || ''}
                      onChange={(event) => updateOrg(selectedOrg.org.id, { status: event.target.value })}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-xs">
                    <span className="text-xs font-semibold text-[#6b5f55]">Plan</span>
                    <select
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      value={selectedOrg.org.plan || ''}
                      onChange={(event) => updateOrg(selectedOrg.org.id, { plan: event.target.value })}
                    >
                      {planOptions.map((plan) => (
                        <option key={plan} value={plan}>
                          {plan}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-xs">
                    <span className="text-xs font-semibold text-[#6b5f55]">Org type</span>
                    <select
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                      value={selectedOrg.org.org_type || ''}
                      onChange={(event) => updateOrg(selectedOrg.org.id, { org_type: event.target.value })}
                    >
                      <option value="">Select type</option>
                      {orgTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  )
}
