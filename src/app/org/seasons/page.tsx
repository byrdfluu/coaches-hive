'use client'

import { useEffect, useState } from 'react'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

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

export default function OrgSeasonsPage() {
  const supabase = createClientComponentClient()
  const [settings, setSettings] = useState<SeasonSettings>({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [createdTeams, setCreatedTeams] = useState<TeamRow[]>([])
  const [creatingTemplate, setCreatingTemplate] = useState<string | null>(null)

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
    return () => {
      active = false
    }
  }, [])

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
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organization</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Seasons</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">Set season dates and team templates.</p>
          </div>
          <button
            className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save season'}
          </button>
        </header>

        {notice ? <p className="mt-3 text-sm text-[#4a4a4a]">{notice}</p> : null}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <OrgSidebar />
          <div className="space-y-6">
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
