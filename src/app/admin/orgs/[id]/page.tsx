'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AdminSidebar from '@/components/AdminSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'

type OrgMember = {
  user_id: string
  role: string
  name: string
  email: string
  created_at: string | null
}

type OrgTeam = {
  id?: string
  name?: string | null
  created_at?: string | null
}

type OrgSettings = Record<string, any>

type OrgDetail = {
  org: {
    id: string
    name: string
    created_at: string | null
    status: string
    plan: string
  }
  settings: OrgSettings | null
  members: OrgMember[]
  teams: OrgTeam[]
  admin_members: OrgMember[]
  coach_members: OrgMember[]
  member_count: number
  onboarding_status: string
  verification_status: string
  fee_paid?: number
  fee_unpaid?: number
}

const formatDate = (value: string | null) => {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const SETTINGS_FIELDS: Array<{ label: string; key: string }> = [
  { label: 'Org name', key: 'org_name' },
  { label: 'Primary contact email', key: 'primary_contact_email' },
  { label: 'Support phone', key: 'support_phone' },
  { label: 'Location', key: 'location' },
  { label: 'Cancellation window', key: 'cancellation_window' },
  { label: 'Reschedule window', key: 'reschedule_window' },
  { label: 'Policy notes', key: 'policy_notes' },
  { label: 'Season start', key: 'season_start' },
  { label: 'Season end', key: 'season_end' },
]

const BILLING_FIELDS: Array<{ label: string; key: string }> = [
  { label: 'Billing contact', key: 'billing_contact' },
  { label: 'Invoice frequency', key: 'invoice_frequency' },
  { label: 'Tax ID', key: 'tax_id' },
  { label: 'Billing address', key: 'billing_address' },
]

export default function AdminOrgDetailPage() {
  const params = useParams()
  const orgId = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : ''

  const [detail, setDetail] = useState<OrgDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [impersonationNotice, setImpersonationNotice] = useState('')

  useEffect(() => {
    if (!orgId) return
    let active = true
    const loadDetail = async () => {
      setLoading(true)
      setNotice('')
      const response = await fetch(`/api/admin/orgs/${orgId}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        if (active) {
          setNotice(payload.error || 'Unable to load organization.')
          setLoading(false)
        }
        return
      }
      const payload = (await response.json()) as OrgDetail
      if (!active) return
      setDetail(payload)
      setLoading(false)
    }
    loadDetail()
    return () => {
      active = false
    }
  }, [orgId])

  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>()
    detail?.members.forEach((member) => {
      counts.set(member.role, (counts.get(member.role) || 0) + 1)
    })
    return Array.from(counts.entries()).map(([role, count]) => ({ role, count }))
  }, [detail])

  const startImpersonation = async (userId: string) => {
    setImpersonationNotice('Starting impersonation...')
    const response = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role: 'org_admin' }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setImpersonationNotice(payload.error || 'Unable to impersonate.')
      return
    }
    setImpersonationNotice(`Impersonating org admin (${userId}).`)
  }

  const clearImpersonation = async () => {
    setImpersonationNotice('Stopping impersonation...')
    const response = await fetch('/api/admin/impersonate/clear', { method: 'POST' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setImpersonationNotice(payload.error || 'Unable to clear impersonation.')
      return
    }
    setImpersonationNotice('Impersonation cleared.')
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">Admin Console</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Organization detail</h1>
            <p className="mt-2 text-sm text-[#6b5f55]">
              Review settings, membership, and branding for the org.
            </p>
          </div>
          <Link
            href="/admin/orgs"
            className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
          >
            Back to orgs
          </Link>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AdminSidebar />
          <div className="space-y-6">
            {loading ? (
              <div className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#6b5f55]">
                Loading organization...
              </div>
            ) : notice ? (
              <div className="glass-card border border-[#191919] bg-white p-6 text-sm text-[#6b5f55]">
                {notice}
              </div>
            ) : detail ? (
              <>
                <section className="grid gap-4 md:grid-cols-4">
                  {[
                    { label: 'Status', value: detail.org.status },
                    { label: 'Plan', value: detail.org.plan },
                    { label: 'Members', value: detail.member_count.toString() },
                    { label: 'Onboarding', value: detail.onboarding_status },
                  ].map((stat) => (
                    <div key={stat.label} className="glass-card border border-[#191919] bg-white p-5">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{stat.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-[#191919]">{stat.value}</p>
                    </div>
                  ))}
                </section>

                <section className="glass-card border border-[#191919] bg-white p-6">
                  <h2 className="text-lg font-semibold text-[#191919]">Verification status</h2>
                  <p className="mt-2 text-sm text-[#6b5f55]">{detail.verification_status}</p>
                </section>

                <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Teams & rosters</h2>
                    <p className="mt-2 text-sm text-[#6b5f55]">Teams: {detail.teams.length}</p>
                    <p className="text-sm text-[#6b5f55]">Members: {detail.member_count}</p>
                    <p className="text-sm text-[#6b5f55]">Coaches: {detail.coach_members.length}</p>
                  </div>
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Calendar & events</h2>
                    <p className="mt-2 text-sm text-[#6b5f55]">Upcoming events: —</p>
                    <p className="text-sm text-[#6b5f55]">Attendance rate: —</p>
                    <p className="text-xs text-[#6b5f55]">Wire to org calendar feed.</p>
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Org payments</h2>
                    <p className="mt-2 text-sm text-[#6b5f55]">Fees paid: {detail.fee_paid ?? 0}</p>
                    <p className="text-sm text-[#6b5f55]">Fees unpaid: {detail.fee_unpaid ?? 0}</p>
                    <p className="text-xs text-[#6b5f55]">Tracks dues and team fees.</p>
                  </div>
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Marketplace revenue</h2>
                    <p className="mt-2 text-sm text-[#6b5f55]">Orders: —</p>
                    <p className="text-sm text-[#6b5f55]">Gross: —</p>
                    <p className="text-xs text-[#6b5f55]">Wire to org marketplace feed.</p>
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Org settings</h2>
                    <div className="mt-4 space-y-3 text-sm">
                      {SETTINGS_FIELDS.map((field) => (
                        <div key={field.key} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          <span className="text-xs font-semibold text-[#6b5f55]">{field.label}</span>
                          <span className="text-[#191919]">
                            {detail.settings?.[field.key] || 'Not set'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Billing plan</h2>
                    <p className="mt-2 text-sm text-[#6b5f55]">Plan: {detail.org.plan}</p>
                    <div className="mt-4 space-y-3 text-sm">
                      {BILLING_FIELDS.map((field) => (
                        <div key={field.key} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          <span className="text-xs font-semibold text-[#6b5f55]">{field.label}</span>
                          <span className="text-[#191919]">
                            {detail.settings?.[field.key] || 'Not set'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Branding</h2>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <p className="text-xs font-semibold text-[#6b5f55]">Logo URL</p>
                        <p className="mt-1 break-all text-[#191919]">
                          {detail.settings?.brand_logo_url || 'Not set'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <p className="text-xs font-semibold text-[#6b5f55]">Cover URL</p>
                        <p className="mt-1 break-all text-[#191919]">
                          {detail.settings?.brand_cover_url || 'Not set'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Permissions</h2>
                    <p className="mt-2 text-sm text-[#6b5f55]">Members by role.</p>
                    <div className="mt-4 space-y-2 text-sm">
                      {roleCounts.length === 0 ? (
                        <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#6b5f55]">
                          No members found.
                        </div>
                      ) : (
                        roleCounts.map((role) => (
                          <div key={role.role} className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                            <span className="text-xs font-semibold text-[#6b5f55]">{role.role}</span>
                            <span className="text-[#191919]">{role.count}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Permissions & compliance</h2>
                    <p className="mt-2 text-sm text-[#6b5f55]">Onboarding: {detail.onboarding_status}</p>
                    <p className="text-sm text-[#6b5f55]">Verification: {detail.verification_status}</p>
                    <p className="text-xs text-[#6b5f55]">Policies, eligibility, and docs.</p>
                  </div>
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Stripe & payouts</h2>
                    <p className="mt-2 text-sm text-[#6b5f55]">Stripe: Not connected</p>
                    <p className="text-sm text-[#6b5f55]">Payouts: —</p>
                    <p className="text-xs text-[#6b5f55]">Wire to org payout data.</p>
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Teams</h2>
                    <div className="mt-4 space-y-3 text-sm">
                      {detail.teams.length === 0 ? (
                        <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#6b5f55]">
                          No teams found.
                        </div>
                      ) : (
                        detail.teams.map((team) => (
                          <div key={team.id || team.name} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                            <p className="font-semibold text-[#191919]">{team.name || 'Team'}</p>
                            <p className="text-xs text-[#6b5f55]">Created {formatDate(team.created_at || null)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="glass-card border border-[#191919] bg-white p-6">
                    <h2 className="text-lg font-semibold text-[#191919]">Coaches</h2>
                    <div className="mt-4 space-y-3 text-sm">
                      {detail.coach_members.length === 0 ? (
                        <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#6b5f55]">
                          No coaches assigned.
                        </div>
                      ) : (
                        detail.coach_members.map((coach) => (
                          <div key={coach.user_id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                            <p className="font-semibold text-[#191919]">{coach.name}</p>
                            <p className="text-xs text-[#6b5f55]">{coach.email}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>

                <section className="glass-card border border-[#191919] bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-[#191919]">Impersonate org admin</h2>
                      <p className="mt-1 text-sm text-[#6b5f55]">Switch to an org admin view for support.</p>
                    </div>
                    <button
                      className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                      onClick={() => clearImpersonation()}
                    >
                      Stop impersonating
                    </button>
                  </div>
                  {impersonationNotice ? (
                    <p className="mt-3 text-xs text-[#6b5f55]">{impersonationNotice}</p>
                  ) : null}
                  <div className="mt-4 space-y-3 text-sm">
                    {detail.admin_members.length === 0 ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#6b5f55]">
                        No org admins found.
                      </div>
                    ) : (
                      detail.admin_members.map((admin) => (
                        <div key={admin.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                          <div>
                            <p className="font-semibold text-[#191919]">{admin.name}</p>
                            <p className="text-xs text-[#6b5f55]">{admin.email}</p>
                            <p className="text-xs text-[#6b5f55]">{admin.role}</p>
                          </div>
                          <button
                            className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                            onClick={() => startImpersonation(admin.user_id)}
                          >
                            Impersonate
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
