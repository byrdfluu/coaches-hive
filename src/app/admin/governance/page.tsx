'use client'

import { useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'

type LeagueSummary = {
  id: string; name: string; sport: string | null; general_location: string | null
  status: string; max_teams: number; billing_model: string; team_count: number
  organization_count: number; administrator_count: number; registration_count: number
  outstanding_cents: number; missing_documents: number; active_season: string | null
}
type GovernanceSnapshot = Record<string, unknown> & { leagues?: LeagueSummary[] }

const metricLabels: Record<string, string> = {
  slack_pending: 'Slack queued', slack_failed: 'Slack failed', slack_dead_letter: 'Slack needs attention',
  slack_sent_24h: 'Slack sent (24h)', push_failed_24h: 'Push failed (24h)',
  push_delivered_24h: 'Push delivered (24h)', test_users: 'Test users',
  test_organizations: 'Test organizations', public_coaches: 'Public coaches',
  public_organizations: 'Public organizations', minor_consent_attention: 'Minor consent attention',
  guardian_invites_pending: 'Guardian invites pending', league_access_pending: 'League access pending',
}
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export default function GovernancePage() {
  const [snapshot, setSnapshot] = useState<GovernanceSnapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)
  const [retryNotice, setRetryNotice] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/admin/governance', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Unable to load governance.')
      setSnapshot(payload?.snapshot || {})
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load governance.')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const retry = async () => {
    if (!window.confirm('Retry eligible failed Slack operational events?')) return
    setRetrying(true)
    setRetryNotice('')
    try {
      const response = await fetch('/api/admin/governance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retry_slack_events', confirmed: true }) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Unable to retry Slack events.')
      setRetryNotice(`${Number(payload?.result || 0)} Slack event${Number(payload?.result || 0) === 1 ? '' : 's'} requeued. Delivery runs every five minutes.`)
      await load()
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Unable to retry Slack events.')
    } finally { setRetrying(false) }
  }

  const leagueValue = snapshot?.leagues
  const leagues = Array.isArray(leagueValue) ? leagueValue : []
  const metrics = Object.entries(snapshot || {}).filter(([key, value]) => key !== 'leagues' && typeof value !== 'object')

  return <main className="page-shell"><div className="relative z-10 px-6 py-10"><div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]"><AdminSidebar/><div>
    <header><p className="text-xs font-bold uppercase tracking-[.24em] text-[#b80f0a]">Superadmin</p><h1 className="mt-2 text-3xl font-bold">Platform Governance</h1><p className="mt-2 text-sm text-neutral-600">Authoritative league capacity, access, compliance, notification, and operational health.</p></header>
    {loading ? <p className="mt-8">Loading governance…</p> : error ? <div className="mt-8 rounded-2xl border border-[#b80f0a] bg-white p-5"><p>{error}</p><button onClick={load} className="mt-3 rounded-full bg-[#191919] px-4 py-2 text-white">Retry</button></div> : <>
      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#dcdcdc] bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wide text-[#4a4a4a]">Leagues</p><p className="mt-2 text-2xl font-semibold">{leagues.length}</p><p className="mt-2 text-sm text-neutral-500">Configured leagues on the platform</p></div>
        {metrics.map(([key, value]) => <div key={key} className="rounded-2xl border border-[#dcdcdc] bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wide text-[#4a4a4a]">{metricLabels[key] || key.replaceAll('_', ' ')}</p><p className="mt-2 break-words text-2xl font-semibold">{String(value ?? 0)}</p>{key === 'slack_pending' && Number(value) > 0 ? <p className="mt-2 text-sm text-amber-700">Waiting in the delivery queue. These have not reached Slack yet.</p> : null}{key === 'slack_dead_letter' && Number(value) > 0 ? <p className="mt-2 text-sm text-amber-700">These will not retry automatically. Confirm the Slack webhooks, then use the retry button below.</p> : null}</div>)}
      </section>
      <section className="mt-8"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#b80f0a]">League operations</p><h2 className="mt-1 text-2xl font-bold">Configured leagues</h2></div>
        {leagues.length === 0 ? <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-white p-5 text-neutral-600">No leagues are configured.</div> : <div className="mt-4 grid gap-4 xl:grid-cols-2">{leagues.map(league => <article key={league.id} className="rounded-2xl border border-[#dcdcdc] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold">{league.name}</h3><p className="mt-1 text-sm text-neutral-600">{[league.sport, league.general_location, league.active_season].filter(Boolean).join(' · ')}</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold uppercase">{league.status}</span></div>
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3"><div><dt className="text-xs uppercase text-neutral-500">Teams</dt><dd className="mt-1 font-semibold">{league.team_count} / {league.max_teams}</dd></div><div><dt className="text-xs uppercase text-neutral-500">Organizations</dt><dd className="mt-1 font-semibold">{league.organization_count}</dd></div><div><dt className="text-xs uppercase text-neutral-500">Administrators</dt><dd className="mt-1 font-semibold">{league.administrator_count}</dd></div><div><dt className="text-xs uppercase text-neutral-500">Registrations</dt><dd className="mt-1 font-semibold">{league.registration_count}</dd></div><div><dt className="text-xs uppercase text-neutral-500">Outstanding</dt><dd className="mt-1 font-semibold">{money(league.outstanding_cents)}</dd></div><div><dt className="text-xs uppercase text-neutral-500">Missing documents</dt><dd className="mt-1 font-semibold">{league.missing_documents}</dd></div></dl>
        </article>)}</div>}
      </section>
      <button onClick={retry} disabled={retrying} className="mt-6 rounded-full bg-[#191919] px-5 py-3 font-semibold text-white disabled:opacity-60">{retrying ? 'Retrying…' : 'Retry failed Slack events'}</button>
      {retryNotice ? <p className="mt-3 text-sm font-semibold text-emerald-700">{retryNotice}</p> : null}
    </>}
  </div></div></div></main>
}
