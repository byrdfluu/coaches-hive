'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import OrgSidebar from '@/components/OrgSidebar'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

// ─── Types ───────────────────────────────────────────────────────────────────

type TryoutEvent = {
  id: string
  org_id: string
  name: string
  sport: string | null
  age_group: string | null
  event_date: string | null
  event_time: string | null
  max_slots: number | null
  registration_fee_cents: number
  status: 'draft' | 'open' | 'closed' | 'complete'
  notes: string | null
  season_id: string | null
  location_id: string | null
}

type Registration = {
  id: string
  athlete_name: string
  athlete_email: string | null
  jersey_number: string | null
  payment_status: 'unpaid' | 'paid'
  created_at: string
}

type Criterion = {
  id: string
  label: string
  max_score: number
  weight: number
  sort_order: number
}

type Evaluation = {
  id: string
  registration_id: string
  criteria_id: string
  evaluator_id: string
  score: number
  notes: string | null
  tryout_criteria?: { label: string; max_score: number; weight: number }
}

type ResultRow = {
  registration: Registration
  composite_score: number
  raw_total: number
  scores_by_criteria: Record<string, { avg: number; count: number }>
}

type OrgTeam = {
  id: string
  name: string
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  draft: 'border border-[#dcdcdc] bg-[#f7f6f4] text-[#4a4a4a]',
  open: 'border border-blue-200 bg-blue-50 text-blue-700',
  closed: 'border border-amber-200 bg-amber-50 text-amber-700',
  complete: 'border border-green-200 bg-green-50 text-green-700',
}

const PAYMENT_BADGE: Record<string, string> = {
  unpaid: 'border border-amber-200 bg-amber-50 text-amber-700',
  paid: 'border border-green-200 bg-green-50 text-green-700',
}

type Tab = 'setup' | 'registrations' | 'evaluate' | 'results'
const TABS: { key: Tab; label: string }[] = [
  { key: 'setup', label: 'Setup' },
  { key: 'registrations', label: 'Registrations' },
  { key: 'evaluate', label: 'Evaluate' },
  { key: 'results', label: 'Results' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function TryoutDetailPage() {
  const params = useParams()
  const id = params.id as string
  const supabase = createClientComponentClient()

  const [tab, setTab] = useState<Tab>('setup')
  const [toast, setToast] = useState('')
  const [tryout, setTryout] = useState<TryoutEvent | null>(null)
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [loading, setLoading] = useState(true)

  // ── Setup tab state ──
  const [setupForm, setSetupForm] = useState<Partial<TryoutEvent> & { registration_fee_dollars?: string }>({})
  const [saving, setSaving] = useState(false)

  // Criteria add form
  const [criteriaForm, setCriteriaForm] = useState({ label: '', max_score: '10', weight: '1.0' })
  const [addingCriterion, setAddingCriterion] = useState(false)

  // ── Registrations tab state ──
  const [regForm, setRegForm] = useState({ athlete_name: '', athlete_email: '', jersey_number: '' })
  const [addingReg, setAddingReg] = useState(false)

  // ── Evaluate tab state ──
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [evalLoaded, setEvalLoaded] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  // scoreInputs: registrationId -> criteriaId -> value
  const [scoreInputs, setScoreInputs] = useState<Record<string, Record<string, string>>>({})
  const [savingScores, setSavingScores] = useState(false)

  // ── Results tab state ──
  const [results, setResults] = useState<ResultRow[] | null>(null)
  const [resultCriteria, setResultCriteria] = useState<Criterion[]>([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [teams, setTeams] = useState<OrgTeam[]>([])
  const [movingReg, setMovingReg] = useState<string | null>(null)

  // ── Load initial data ──
  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const [tryoutRes, regRes, criteriaRes] = await Promise.all([
        fetch(`/api/org/tryouts/${id}`),
        fetch(`/api/org/tryouts/${id}/registrations`),
        fetch(`/api/org/tryouts/${id}/criteria`),
      ])
      if (!active) return
      if (tryoutRes.ok) {
        const p = await tryoutRes.json()
        setTryout(p.tryout)
        setSetupForm({
          ...p.tryout,
          registration_fee_dollars: p.tryout.registration_fee_cents
            ? (p.tryout.registration_fee_cents / 100).toFixed(2)
            : '0.00',
        })
      }
      if (regRes.ok) {
        const p = await regRes.json()
        setRegistrations(p.registrations ?? [])
      }
      if (criteriaRes.ok) {
        const p = await criteriaRes.json()
        setCriteria(p.criteria ?? [])
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [id])

  // ── Get current user ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null)
    })
  }, [supabase])

  // ── Load evaluations when switching to evaluate tab ──
  useEffect(() => {
    if (tab !== 'evaluate' || evalLoaded) return
    let active = true
    const loadEvals = async () => {
      const res = await fetch(`/api/org/tryouts/${id}/evaluations`)
      if (!res.ok || !active) return
      const p = await res.json()
      const evList: Evaluation[] = p.evaluations ?? []
      setEvaluations(evList)
      setEvalLoaded(true)

      // Pre-fill inputs for current user
      const inputs: Record<string, Record<string, string>> = {}
      for (const ev of evList) {
        if (ev.evaluator_id !== currentUserId) continue
        if (!inputs[ev.registration_id]) inputs[ev.registration_id] = {}
        inputs[ev.registration_id][ev.criteria_id] = String(ev.score)
      }
      setScoreInputs(inputs)
    }
    loadEvals()
    return () => { active = false }
  }, [tab, evalLoaded, id, currentUserId])

  // ── Load teams when results tab is shown ──
  useEffect(() => {
    if (tab !== 'results' || !tryout?.org_id) return
    let active = true
    supabase
      .from('org_teams')
      .select('id, name')
      .eq('org_id', tryout.org_id)
      .then(({ data }) => {
        if (active) setTeams((data ?? []) as OrgTeam[])
      })
    return () => { active = false }
  }, [tab, tryout?.org_id, supabase])

  // ─────────────────────────────────────────────────────────────────────────
  // Setup handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleSaveSetup = async () => {
    setSaving(true)
    const res = await fetch(`/api/org/tryouts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: setupForm.name,
        sport: setupForm.sport,
        age_group: setupForm.age_group,
        event_date: setupForm.event_date,
        event_time: setupForm.event_time,
        max_slots: setupForm.max_slots,
        registration_fee_cents: setupForm.registration_fee_dollars
          ? Math.round(parseFloat(setupForm.registration_fee_dollars) * 100)
          : 0,
        status: setupForm.status,
        notes: setupForm.notes,
        season_id: setupForm.season_id,
        location_id: setupForm.location_id,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const p = await res.json().catch(() => ({}))
      setToast(p.error || 'Failed to save')
      return
    }
    const p = await res.json()
    setTryout(p.tryout)
    setToast('Tryout saved')
  }

  const handleAddCriterion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!criteriaForm.label.trim()) { setToast('Label is required'); return }
    setAddingCriterion(true)
    const res = await fetch(`/api/org/tryouts/${id}/criteria`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: criteriaForm.label.trim(),
        max_score: parseInt(criteriaForm.max_score, 10) || 10,
        weight: parseFloat(criteriaForm.weight) || 1.0,
        sort_order: criteria.length,
      }),
    })
    setAddingCriterion(false)
    if (!res.ok) { setToast('Failed to add criterion'); return }
    const p = await res.json()
    setCriteria((prev) => [...prev, p.criterion])
    setCriteriaForm({ label: '', max_score: '10', weight: '1.0' })
    setToast('Criterion added')
  }

  const handleDeleteCriterion = async (criterionId: string) => {
    const res = await fetch(`/api/org/tryouts/${id}/criteria?criterion_id=${criterionId}`, {
      method: 'DELETE',
    })
    if (!res.ok) { setToast('Failed to delete criterion'); return }
    setCriteria((prev) => prev.filter((c) => c.id !== criterionId))
    setToast('Criterion removed')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Registrations handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleAddRegistration = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regForm.athlete_name.trim()) { setToast('Athlete name is required'); return }
    setAddingReg(true)
    const res = await fetch(`/api/org/tryouts/${id}/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        athlete_name: regForm.athlete_name.trim(),
        athlete_email: regForm.athlete_email.trim() || undefined,
        jersey_number: regForm.jersey_number.trim() || undefined,
      }),
    })
    setAddingReg(false)
    if (!res.ok) { setToast('Failed to add athlete'); return }
    const p = await res.json()
    setRegistrations((prev) => [...prev, p.registration])
    setRegForm({ athlete_name: '', athlete_email: '', jersey_number: '' })
    setToast('Athlete added')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Evaluate handlers
  // ─────────────────────────────────────────────────────────────────────────

  const setScore = (regId: string, criteriaId: string, val: string) => {
    setScoreInputs((prev) => ({
      ...prev,
      [regId]: { ...(prev[regId] ?? {}), [criteriaId]: val },
    }))
  }

  const handleSaveScores = async () => {
    setSavingScores(true)
    const scores: Array<{ registration_id: string; criteria_id: string; score: number }> = []
    for (const [regId, byCriteria] of Object.entries(scoreInputs)) {
      for (const [criteriaId, val] of Object.entries(byCriteria)) {
        if (val === '') continue
        const score = parseFloat(val)
        if (!isNaN(score)) {
          scores.push({ registration_id: regId, criteria_id: criteriaId, score })
        }
      }
    }
    if (scores.length === 0) { setToast('No scores to save'); setSavingScores(false); return }
    const res = await fetch(`/api/org/tryouts/${id}/evaluations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores }),
    })
    setSavingScores(false)
    if (!res.ok) { setToast('Failed to save scores'); return }
    setToast('Scores saved')
  }

  // Composite score for a registration based on current inputs
  const getCompositePreview = (regId: string): string => {
    if (criteria.length === 0) return '—'
    const byCriteria = scoreInputs[regId] ?? {}
    let sum = 0
    let hasAny = false
    for (const c of criteria) {
      const v = byCriteria[c.id]
      if (v !== undefined && v !== '') {
        sum += parseFloat(v) || 0
        hasAny = true
      }
    }
    return hasAny ? sum.toFixed(1) : '—'
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Results handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleLoadResults = async () => {
    setLoadingResults(true)
    const res = await fetch(`/api/org/tryouts/${id}/results`)
    setLoadingResults(false)
    if (!res.ok) { setToast('Failed to load results'); return }
    const p = await res.json()
    setResults(p.results ?? [])
    setResultCriteria(p.criteria ?? [])
  }

  const handleExportCsv = () => {
    if (!results || results.length === 0) return
    const headers = ['Rank', 'Name', 'Jersey', 'Composite Score', ...resultCriteria.map((c) => c.label)]
    const rows = results.map((r, i) => [
      i + 1,
      r.registration.athlete_name,
      r.registration.jersey_number ?? '',
      r.composite_score,
      ...resultCriteria.map((c) => r.scores_by_criteria[c.id]?.avg?.toFixed(2) ?? ''),
    ])
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tryout-results-${id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleMoveToTeam = useCallback(async (registration: Registration, teamId: string) => {
    if (!teamId || !tryout?.org_id) return
    setMovingReg(registration.id)
    const { data: userData } = await supabase.auth.getUser()
    const athleteId = registration.id // use registration id as fallback if no athlete_id

    // Try to get the athlete_id from the registration
    const { data: regRow } = await supabase
      .from('tryout_registrations')
      .select('athlete_id')
      .eq('id', registration.id)
      .maybeSingle()

    const userId = (regRow as { athlete_id?: string | null } | null)?.athlete_id ?? null
    if (!userId) {
      setToast('No linked athlete account for this registration')
      setMovingReg(null)
      return
    }

    const { error } = await supabase
      .from('org_team_members')
      .upsert(
        { team_id: teamId, user_id: userId, role: 'athlete' },
        { onConflict: 'team_id,user_id' }
      )

    setMovingReg(null)
    if (error) { setToast('Failed to add to team'); return }
    setToast(`${registration.athlete_name} added to team`)
  }, [supabase, tryout?.org_id])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="page-shell">
        <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
          <RoleInfoBanner role="admin" />
          <p className="mt-6 text-sm text-[#4a4a4a]">Loading…</p>
        </div>
      </main>
    )
  }

  if (!tryout) {
    return (
      <main className="page-shell">
        <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
          <RoleInfoBanner role="admin" />
          <p className="mt-6 text-sm text-[#4a4a4a]">Tryout not found.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="admin" />

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">
              <a href="/org/tryouts" className="hover:underline">Tryouts</a> / {tryout.name}
            </p>
            <h1 className="display text-3xl font-semibold text-[#191919]">{tryout.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[tryout.status] ?? STATUS_BADGE.draft}`}>
                {tryout.status.charAt(0).toUpperCase() + tryout.status.slice(1)}
              </span>
              {tryout.sport && <span className="text-xs text-[#4a4a4a]">{tryout.sport}</span>}
              {tryout.age_group && <span className="text-xs text-[#4a4a4a]">· {tryout.age_group}</span>}
            </div>
          </div>
        </header>

        {/* Tabs */}
        <nav className="mt-6 flex gap-1 border-b border-[#dcdcdc]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t.key
                  ? 'border-b-2 border-[#b80f0a] text-[#b80f0a]'
                  : 'text-[#4a4a4a] hover:text-[#191919]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-1">
          <OrgSidebar />

          {/* ── Setup tab ── */}
          {tab === 'setup' && (
            <div className="space-y-6">
              <section className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="mb-4 text-base font-semibold text-[#191919]">Event details</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Event name *</span>
                    <input
                      type="text"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={setupForm.name ?? ''}
                      onChange={(e) => setSetupForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Sport</span>
                    <input
                      type="text"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={setupForm.sport ?? ''}
                      onChange={(e) => setSetupForm((f) => ({ ...f, sport: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Age group</span>
                    <input
                      type="text"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={setupForm.age_group ?? ''}
                      onChange={(e) => setSetupForm((f) => ({ ...f, age_group: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Event date</span>
                    <input
                      type="date"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={setupForm.event_date ?? ''}
                      onChange={(e) => setSetupForm((f) => ({ ...f, event_date: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Event time</span>
                    <input
                      type="time"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={setupForm.event_time ?? ''}
                      onChange={(e) => setSetupForm((f) => ({ ...f, event_time: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Max slots</span>
                    <input
                      type="number"
                      min="1"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={setupForm.max_slots ?? ''}
                      onChange={(e) => setSetupForm((f) => ({ ...f, max_slots: e.target.value ? parseInt(e.target.value, 10) : null }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Registration fee ($)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={setupForm.registration_fee_dollars ?? '0.00'}
                      onChange={(e) => setSetupForm((f) => ({ ...f, registration_fee_dollars: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Status</span>
                    <select
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={setupForm.status ?? 'draft'}
                      onChange={(e) => setSetupForm((f) => ({ ...f, status: e.target.value as TryoutEvent['status'] }))}
                    >
                      <option value="draft">Draft</option>
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                      <option value="complete">Complete</option>
                    </select>
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Notes</span>
                    <textarea
                      rows={3}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={setupForm.notes ?? ''}
                      onChange={(e) => setSetupForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="mt-4">
                  <button
                    onClick={handleSaveSetup}
                    disabled={saving}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </section>

              {/* Scoring criteria */}
              <section className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="mb-1 text-base font-semibold text-[#191919]">Scoring criteria</h2>
                <p className="mb-4 text-xs text-[#4a4a4a]">Define the categories used to evaluate athletes. Weighted scores are averaged into a composite.</p>

                {criteria.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {criteria.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-4 py-3 text-sm"
                      >
                        <div>
                          <span className="font-semibold text-[#191919]">{c.label}</span>
                          <span className="ml-2 text-xs text-[#4a4a4a]">Max: {c.max_score} · Weight: {c.weight}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteCriterion(c.id)}
                          className="text-xs font-semibold text-[#b80f0a] hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleAddCriterion} className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1 md:col-span-2">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Label *</span>
                    <input
                      type="text"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={criteriaForm.label}
                      onChange={(e) => setCriteriaForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder="e.g. Speed, Ball Control"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Max score</span>
                    <input
                      type="number"
                      min="1"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={criteriaForm.max_score}
                      onChange={(e) => setCriteriaForm((f) => ({ ...f, max_score: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Weight</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={criteriaForm.weight}
                      onChange={(e) => setCriteriaForm((f) => ({ ...f, weight: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-end md:col-span-4">
                    <button
                      type="submit"
                      disabled={addingCriterion}
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {addingCriterion ? 'Adding…' : 'Add criterion'}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {/* ── Registrations tab ── */}
          {tab === 'registrations' && (
            <div className="space-y-6">
              <section className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="mb-4 text-base font-semibold text-[#191919]">Add athlete</h2>
                <form onSubmit={handleAddRegistration} className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Name *</span>
                    <input
                      type="text"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={regForm.athlete_name}
                      onChange={(e) => setRegForm((f) => ({ ...f, athlete_name: e.target.value }))}
                      placeholder="Full name"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Email</span>
                    <input
                      type="email"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={regForm.athlete_email}
                      onChange={(e) => setRegForm((f) => ({ ...f, athlete_email: e.target.value }))}
                      placeholder="athlete@email.com"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-[#4a4a4a]">Jersey #</span>
                    <input
                      type="text"
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm"
                      value={regForm.jersey_number}
                      onChange={(e) => setRegForm((f) => ({ ...f, jersey_number: e.target.value }))}
                      placeholder="e.g. 10"
                    />
                  </label>
                  <div className="flex items-end md:col-span-3">
                    <button
                      type="submit"
                      disabled={addingReg}
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {addingReg ? 'Adding…' : 'Add athlete'}
                    </button>
                  </div>
                </form>
              </section>

              <section className="glass-card border border-[#191919] bg-white p-6">
                <h2 className="mb-4 text-base font-semibold text-[#191919]">
                  Registered athletes <span className="text-sm font-normal text-[#4a4a4a]">({registrations.length})</span>
                </h2>
                {registrations.length === 0 ? (
                  <p className="text-sm text-[#4a4a4a]">No athletes registered yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#dcdcdc] text-left text-xs font-semibold text-[#4a4a4a]">
                          <th className="pb-2 pr-4">#</th>
                          <th className="pb-2 pr-4">Name</th>
                          <th className="pb-2 pr-4">Email</th>
                          <th className="pb-2 pr-4">Payment</th>
                          <th className="pb-2">Registered</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registrations.map((r) => (
                          <tr key={r.id} className="border-b border-[#f0f0f0]">
                            <td className="py-2 pr-4 text-[#4a4a4a]">{r.jersey_number ?? '—'}</td>
                            <td className="py-2 pr-4 font-medium text-[#191919]">{r.athlete_name}</td>
                            <td className="py-2 pr-4 text-[#4a4a4a]">{r.athlete_email ?? '—'}</td>
                            <td className="py-2 pr-4">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_BADGE[r.payment_status] ?? PAYMENT_BADGE.unpaid}`}>
                                {r.payment_status.charAt(0).toUpperCase() + r.payment_status.slice(1)}
                              </span>
                            </td>
                            <td className="py-2 text-xs text-[#4a4a4a]">
                              {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ── Evaluate tab ── */}
          {tab === 'evaluate' && (
            <div className="space-y-6">
              {criteria.length === 0 || registrations.length === 0 ? (
                <div className="glass-card border border-[#dcdcdc] bg-white p-8 text-center">
                  <p className="text-sm font-semibold text-[#191919]">Not ready to evaluate yet</p>
                  <p className="mt-1 text-sm text-[#4a4a4a]">
                    {criteria.length === 0 && 'Add scoring criteria in the Setup tab. '}
                    {registrations.length === 0 && 'Add athlete registrations in the Registrations tab.'}
                  </p>
                </div>
              ) : (
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-[#191919]">Score athletes</h2>
                    <button
                      onClick={handleSaveScores}
                      disabled={savingScores}
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {savingScores ? 'Saving…' : 'Save scores'}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#dcdcdc] text-left text-xs font-semibold text-[#4a4a4a]">
                          <th className="pb-2 pr-3">#</th>
                          <th className="pb-2 pr-3">Athlete</th>
                          {criteria.map((c) => (
                            <th key={c.id} className="pb-2 pr-3 min-w-[90px]">
                              {c.label}
                              <span className="block text-[10px] font-normal text-[#4a4a4a]">/ {c.max_score}</span>
                            </th>
                          ))}
                          <th className="pb-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registrations.map((r) => (
                          <tr key={r.id} className="border-b border-[#f0f0f0]">
                            <td className="py-2 pr-3 text-[#4a4a4a]">{r.jersey_number ?? '—'}</td>
                            <td className="py-2 pr-3 font-medium text-[#191919] whitespace-nowrap">{r.athlete_name}</td>
                            {criteria.map((c) => (
                              <td key={c.id} className="py-2 pr-3">
                                <input
                                  type="number"
                                  min="0"
                                  max={c.max_score}
                                  step="0.1"
                                  className="w-20 rounded-xl border border-[#dcdcdc] bg-white px-2 py-1 text-sm text-center"
                                  value={scoreInputs[r.id]?.[c.id] ?? ''}
                                  onChange={(e) => setScore(r.id, c.id, e.target.value)}
                                  placeholder="—"
                                />
                              </td>
                            ))}
                            <td className="py-2 text-right font-semibold text-[#191919]">
                              {getCompositePreview(r.id)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 text-right">
                    <button
                      onClick={handleSaveScores}
                      disabled={savingScores}
                      className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {savingScores ? 'Saving…' : 'Save scores'}
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ── Results tab ── */}
          {tab === 'results' && (
            <div className="space-y-6">
              {results === null ? (
                <div className="glass-card border border-[#191919] bg-white p-8 text-center">
                  <p className="mb-4 text-sm text-[#4a4a4a]">Click below to compute composite scores from all evaluator inputs.</p>
                  <button
                    onClick={handleLoadResults}
                    disabled={loadingResults}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {loadingResults ? 'Loading…' : 'Load results'}
                  </button>
                </div>
              ) : (
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-[#191919]">
                      Results <span className="text-sm font-normal text-[#4a4a4a]">({results.length} athletes)</span>
                    </h2>
                    <div className="flex gap-2">
                      <button
                        onClick={handleLoadResults}
                        disabled={loadingResults}
                        className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] disabled:opacity-50"
                      >
                        {loadingResults ? 'Refreshing…' : 'Refresh'}
                      </button>
                      <button
                        onClick={handleExportCsv}
                        className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919]"
                      >
                        Export CSV
                      </button>
                    </div>
                  </div>

                  {results.length === 0 ? (
                    <p className="text-sm text-[#4a4a4a]">No results yet. Add evaluations first.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#dcdcdc] text-left text-xs font-semibold text-[#4a4a4a]">
                            <th className="pb-2 pr-3">Rank</th>
                            <th className="pb-2 pr-3">Name</th>
                            <th className="pb-2 pr-3">#</th>
                            <th className="pb-2 pr-3">Composite</th>
                            {resultCriteria.map((c) => (
                              <th key={c.id} className="pb-2 pr-3 min-w-[80px]">{c.label}</th>
                            ))}
                            {teams.length > 0 && <th className="pb-2">Move to team</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((r, i) => (
                            <tr key={r.registration.id} className="border-b border-[#f0f0f0]">
                              <td className="py-2 pr-3 font-semibold text-[#191919]">#{i + 1}</td>
                              <td className="py-2 pr-3 font-medium text-[#191919] whitespace-nowrap">{r.registration.athlete_name}</td>
                              <td className="py-2 pr-3 text-[#4a4a4a]">{r.registration.jersey_number ?? '—'}</td>
                              <td className="py-2 pr-3 font-semibold text-[#b80f0a]">{r.composite_score.toFixed(2)}</td>
                              {resultCriteria.map((c) => (
                                <td key={c.id} className="py-2 pr-3 text-[#4a4a4a]">
                                  {r.scores_by_criteria[c.id]?.avg != null
                                    ? r.scores_by_criteria[c.id].avg.toFixed(2)
                                    : '—'}
                                </td>
                              ))}
                              {teams.length > 0 && (
                                <td className="py-2">
                                  <select
                                    className="rounded-xl border border-[#dcdcdc] bg-white px-2 py-1 text-xs"
                                    defaultValue=""
                                    disabled={movingReg === r.registration.id}
                                    onChange={(e) => {
                                      if (e.target.value) handleMoveToTeam(r.registration, e.target.value)
                                    }}
                                  >
                                    <option value="">Move to team…</option>
                                    {teams.map((team) => (
                                      <option key={team.id} value={team.id}>{team.name}</option>
                                    ))}
                                  </select>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
