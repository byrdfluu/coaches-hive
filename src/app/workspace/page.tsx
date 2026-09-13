'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildPortalChoices, type PortalContextPayload } from '@/lib/portalChoices'

export default function WorkspacePage() {
  const [data, setData] = useState<PortalContextPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    const response = await fetch('/api/roles/available', { cache: 'no-store' }).catch(() => null)
    const payload = response ? await response.json().catch(() => null) : null
    if (!response?.ok) setError(payload?.error || 'Unable to load your profiles and workspaces. Please retry.')
    else setData(payload)
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const choices = useMemo(() => buildPortalChoices(data || {}), [data])
  const choose = async (choice: ReturnType<typeof buildPortalChoices>[number]) => {
    setSwitching(choice.id); setError('')
    const response = await fetch('/api/workspaces/active', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: choice.workspaceId, acting_role: choice.actingRole, athlete_profile_id: choice.athleteProfileId, coach_team_id: choice.coachTeamId }),
    }).catch(() => null)
    const payload = response ? await response.json().catch(() => null) : null
    if (response?.ok) window.location.assign(payload?.next_path || choice.href)
    else { setError(payload?.error || 'Unable to switch profiles. Please retry.'); setSwitching(''); await load() }
  }
  return <main className="page-shell min-h-screen"><div className="relative z-10 mx-auto max-w-3xl px-5 py-12">
    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6b5f55]">My access</p>
    <h1 className="mt-2 text-4xl font-semibold text-[#191919]">Switch profile or workspace</h1>
    <p className="mt-3 text-[#4a4a4a]">Choose an assigned role, organization, team, league, or athlete profile. Your selection is shared with Coaches Hive on mobile.</p>
    {error ? <div className="mt-6 rounded-2xl border border-[#b80f0a] bg-white p-4"><p className="text-sm text-[#191919]">{error}</p><button type="button" onClick={() => void load()} className="mt-3 rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white">Retry</button></div> : null}
    <div className="mt-8 space-y-3" aria-live="polite">
      {loading ? <p className="rounded-2xl bg-white p-5 text-sm text-[#4a4a4a]">Loading your authorized profiles…</p> : null}
      {!loading && choices.map(choice => <button key={choice.id} type="button" disabled={Boolean(switching)} onClick={() => void choose(choice)} className={`flex min-h-[84px] w-full items-center gap-4 rounded-2xl border bg-white p-5 text-left transition ${choice.active ? 'border-[#b80f0a] shadow-md' : 'border-[#dcdcdc] hover:border-[#191919]'}`}>
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f1e5e4] text-sm font-bold text-[#b80f0a]">{choice.avatarUrl ? <img src={choice.avatarUrl} alt="" className="h-full w-full object-cover" /> : choice.label.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-lg font-semibold text-[#191919]">{choice.label}</span><span className="mt-1 block text-sm text-[#4a4a4a]">{choice.detail}</span></span>
        <span className="text-sm font-semibold text-[#191919]">{switching === choice.id ? 'Opening…' : choice.active ? 'Current' : 'Open'}</span>
      </button>)}
      {!loading && !choices.length && !error ? <p className="rounded-2xl bg-white p-5 text-sm text-[#4a4a4a]">No assigned profiles or workspaces were found. Ask your administrator to verify your membership.</p> : null}
    </div>
  </div></main>
}
