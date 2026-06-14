'use client'

import { useEffect, useState } from 'react'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

type Season = {
  id: string
  org_id: string
  name: string
  status: 'draft' | 'active' | 'archived'
  season_start: string | null
  season_end: string | null
  created_at: string
  updated_at: string
}

type SeasonSettings = {
  season_start?: string
  season_end?: string
}

type TeamTemplate = {
  name: string
  sport: string
  level: string
  age_range: string
  grade_level: string
}

const TEAM_TEMPLATES: TeamTemplate[] = [
  { name: 'Varsity', sport: 'Multi-sport', level: 'Varsity', age_range: '15-18', grade_level: '9-12' },
  { name: 'JV (Junior Varsity)', sport: 'Multi-sport', level: 'Junior Varsity', age_range: '14-16', grade_level: '9-10' },
  { name: 'Travel Squad', sport: 'Multi-sport', level: 'Competitive', age_range: '12-18', grade_level: '7-12' },
  { name: 'Rec League', sport: 'Multi-sport', level: 'Recreational', age_range: 'All ages', grade_level: 'All grades' },
  { name: 'Youth Development', sport: 'Multi-sport', level: 'Development', age_range: '8-12', grade_level: '3-6' },
]

type TeamRow = {
  id: string
  name: string
  created_at: string
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  const fmt = (d: string) => {
    const date = new Date(d + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  if (start) return `From ${fmt(start)}`
  if (end) return `Until ${fmt(end)}`
  return '—'
}

function StatusBadge({ status }: { status: Season['status'] }) {
  if (status === 'active') {
    return (
      <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
        Active
      </span>
    )
  }
  if (status === 'archived') {
    return (
      <span className="rounded-full border border-[#dcdcdc] bg-[#f5f5f5] px-2 py-0.5 text-xs font-semibold text-[#9b9b9b]">
        Archived
      </span>
    )
  }
  return (
    <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-xs font-semibold text-[#9b9b9b]">
      Draft
    </span>
  )
}

export default function OrgSeasonsPage() {
  const supabase = createClientComponentClient()

  // Season state
  const [seasons, setSeasons] = useState<Season[]>([])
  const [seasonsLoading, setSeasonsLoading] = useState(true)
  const [showNewSeasonForm, setShowNewSeasonForm] = useState(false)
  const [newSeason, setNewSeason] = useState({ name: '', season_start: '', season_end: '' })
  const [creatingSeason, setCreatingSeason] = useState(false)
  const [seasonActioning, setSeasonActioning] = useState<string | null>(null)

  // Legacy season settings state
  const [settings, setSettings] = useState<SeasonSettings>({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [createdTeams, setCreatedTeams] = useState<TeamRow[]>([])
  const [creatingTemplate, setCreatingTemplate] = useState<string | null>(null)

  // Load program seasons
  useEffect(() => {
    let active = true
    const load = async () => {
      setSeasonsLoading(true)
      try {
        const res = await fetch('/api/org/seasons')
        if (!res.ok) return
        const payload = await res.json()
        if (!active) return
        setSeasons(payload.seasons ?? [])
      } finally {
        if (active) setSeasonsLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  // Load legacy settings
  useEffect(() => {
    let active = true
    const loadSettings = async () => {
      const response = await fetch('/api/org/settings')
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      setSettings({
        season_start: payload?.settings?.season_start || '',
        season_end: payload?.settings?.season_end || '',
      })
    }
    loadSettings()
    return () => { active = false }
  }, [])

  // Load org + teams
  useEffect(() => {
    let active = true
    const loadOrg = async () => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .maybeSingle()
      const membershipRow = (membership || null) as { org_id?: string | null } | null
      if (!active || !membershipRow?.org_id) return
      setOrgId(membershipRow.org_id)
      const { data: teams } = await supabase
        .from('org_teams')
        .select('id, name, created_at')
        .eq('org_id', membershipRow.org_id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (!active) return
      setCreatedTeams((teams || []) as TeamRow[])
    }
    loadOrg()
    return () => { active = false }
  }, [supabase])

  const handleCreateSeason = async () => {
    if (!newSeason.name.trim() || creatingSeason) return
    setCreatingSeason(true)
    try {
      const res = await fetch('/api/org/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSeason),
      })
      const payload = await res.json()
      if (!res.ok) {
        setToast(payload.error || 'Failed to create season')
        return
      }
      setSeasons((prev) => [payload.season, ...prev])
      setNewSeason({ name: '', season_start: '', season_end: '' })
      setShowNewSeasonForm(false)
      setToast('Season created')
    } finally {
      setCreatingSeason(false)
    }
  }

  const handleActivateSeason = async (id: string) => {
    if (seasonActioning) return
    setSeasonActioning(id)
    try {
      const res = await fetch(`/api/org/seasons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      const payload = await res.json()
      if (!res.ok) {
        setToast(payload.error || 'Failed to activate season')
        return
      }
      // Update list: set activated season to active, others that were active to archived
      setSeasons((prev) =>
        prev.map((s) => {
          if (s.id === id) return payload.season as Season
          if (s.status === 'active') return { ...s, status: 'archived' as const }
          return s
        })
      )
      setToast('Season activated')
    } finally {
      setSeasonActioning(null)
    }
  }

  const handleArchiveSeason = async (id: string) => {
    if (seasonActioning) return
    setSeasonActioning(id)
    try {
      const res = await fetch(`/api/org/seasons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      })
      const payload = await res.json()
      if (!res.ok) {
        setToast(payload.error || 'Failed to archive season')
        return
      }
      setSeasons((prev) => prev.map((s) => (s.id === id ? (payload.season as Season) : s)))
      setToast('Season archived')
    } finally {
      setSeasonActioning(null)
    }
  }

  const handleDeleteSeason = async (id: string) => {
    if (seasonActioning) return
    setSeasonActioning(id)
    try {
      const res = await fetch(`/api/org/seasons/${id}`, { method: 'DELETE' })
      const payload = await res.json()
      if (!res.ok) {
        setToast(payload.error || 'Failed to delete season')
        return
      }
      setSeasons((prev) => prev.filter((s) => s.id !== id))
      setToast('Season deleted')
    } finally {
      setSeasonActioning(null)
    }
  }

  const handleCreateFromTemplate = async (template: TeamTemplate) => {
    if (!orgId || creatingTemplate) return
    setCreatingTemplate(template.name)
    const { data, error } = await supabase
      .from('org_teams')
      .insert({
        org_id: orgId,
        name: template.name,
        sport: template.sport,
        level: template.level,
        age_range: template.age_range,
        grade_level: template.grade_level,
      })
      .select('id, name, created_at')
      .single()
    setCreatingTemplate(null)
    if (error || !data) {
      setToast('Unable to create team. Try again.')
      return
    }
    setCreatedTeams((prev) => [data as TeamRow, ...prev])
    setToast(`Team "${template.name}" created.`)
  }

  const handleSave = async () => {
    setSaving(true)
    setNotice('')
    const response = await fetch('/api/org/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (!response.ok) {
      setNotice('Unable to save season settings.')
    } else {
      setNotice('Season settings saved.')
      setToast('Save complete')
    }
    setSaving(false)
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Seasons</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Manage program seasons and team templates.</p>
          </div>
          <button
            className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save season'}
          </button>
        </header>

        {notice ? <p className="mt-3 text-sm text-[#4a4a4a]">{notice}</p> : null}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-1">
          <div className="lg:hidden"><OrgSidebar /></div>
          <div className="space-y-6">

            {/* Program Seasons */}
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#191919]">Program seasons</h2>
                  <p className="mt-1 text-sm text-[#4a4a4a]">Track your organization&apos;s active and historical seasons.</p>
                </div>
                {!showNewSeasonForm && (
                  <button
                    type="button"
                    onClick={() => setShowNewSeasonForm(true)}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
                  >
                    New season
                  </button>
                )}
              </div>

              {/* Season list */}
              <div className="mt-4 space-y-3">
                {seasonsLoading ? (
                  <p className="text-sm text-[#9b9b9b]">Loading seasons…</p>
                ) : seasons.length === 0 ? (
                  <p className="text-sm text-[#9b9b9b]">No seasons yet. Create your first season above.</p>
                ) : (
                  seasons.map((season) => (
                    <div
                      key={season.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-[#191919]">{season.name}</p>
                          <StatusBadge status={season.status} />
                        </div>
                        <p className="mt-0.5 text-xs text-[#6b5f55]">
                          {formatDateRange(season.season_start, season.season_end)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {season.status === 'draft' && (
                          <>
                            <button
                              type="button"
                              disabled={seasonActioning === season.id}
                              onClick={() => handleActivateSeason(season.id)}
                              className="rounded-full border border-green-600 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                            >
                              {seasonActioning === season.id ? '...' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              disabled={seasonActioning === season.id}
                              onClick={() => handleDeleteSeason(season.id)}
                              className="text-xs font-semibold text-[#9b9b9b] underline hover:text-[#b80f0a] disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {season.status === 'active' && (
                          <button
                            type="button"
                            disabled={seasonActioning === season.id}
                            onClick={() => handleArchiveSeason(season.id)}
                            className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#4a4a4a] hover:border-[#191919] disabled:opacity-50"
                          >
                            {seasonActioning === season.id ? '...' : 'Archive'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* New season inline form */}
              {showNewSeasonForm && (
                <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <p className="mb-3 text-sm font-semibold text-[#191919]">New season</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Season name *</span>
                      <input
                        type="text"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                        placeholder="Fall 2025"
                        value={newSeason.name}
                        onChange={(e) => setNewSeason((prev) => ({ ...prev, name: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Start date</span>
                      <input
                        type="date"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                        value={newSeason.season_start}
                        onChange={(e) => setNewSeason((prev) => ({ ...prev, season_start: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#4a4a4a]">End date</span>
                      <input
                        type="date"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                        value={newSeason.season_end}
                        onChange={(e) => setNewSeason((prev) => ({ ...prev, season_end: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!newSeason.name.trim() || creatingSeason}
                      onClick={handleCreateSeason}
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {creatingSeason ? 'Creating...' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowNewSeasonForm(false); setNewSeason({ name: '', season_start: '', season_end: '' }) }}
                      className="text-sm text-[#9b9b9b] hover:text-[#191919]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Legacy season dates */}
            <section className="glass-card border border-[#191919] bg-white p-6">
              <h2 className="text-lg font-semibold text-[#191919]">Season dates</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Season start</span>
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={settings.season_start || ''}
                    onChange={(event) => setSettings((prev) => ({ ...prev, season_start: event.target.value }))}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-[#4a4a4a]">Season end</span>
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2"
                    value={settings.season_end || ''}
                    onChange={(event) => setSettings((prev) => ({ ...prev, season_end: event.target.value }))}
                  />
                </label>
              </div>
            </section>

            {/* Team templates */}
            <section className="glass-card border border-[#191919] bg-white p-6">
              <div>
                <h2 className="text-lg font-semibold text-[#191919]">Team templates</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">Spin up common team structures in one click. Each creates a real team under your org.</p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {TEAM_TEMPLATES.map((template) => (
                  <button
                    key={template.name}
                    type="button"
                    disabled={!orgId || creatingTemplate === template.name}
                    onClick={() => handleCreateFromTemplate(template)}
                    className="flex flex-col items-start rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-4 text-left text-sm transition hover:border-[#191919] disabled:opacity-50"
                  >
                    <p className="font-semibold text-[#191919]">{template.name}</p>
                    <p className="mt-1 text-xs text-[#6b5f55]">{template.level} · Ages {template.age_range}</p>
                    <span className="mt-3 text-xs font-semibold text-[#b80f0a]">
                      {creatingTemplate === template.name ? 'Creating…' : '+ Create team'}
                    </span>
                  </button>
                ))}
              </div>
              {createdTeams.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">Teams created this season</p>
                  <div className="mt-3 space-y-2">
                    {createdTeams.map((team) => (
                      <div
                        key={team.id}
                        className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3 text-sm"
                      >
                        <p className="font-semibold text-[#191919]">{team.name}</p>
                        <a
                          href="/org/teams"
                          className="text-xs font-semibold text-[#b80f0a] underline"
                        >
                          Manage
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
