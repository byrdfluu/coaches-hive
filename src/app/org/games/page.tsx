'use client'

import { useCallback, useEffect, useState } from 'react'
import OrgSidebar from '@/components/OrgSidebar'
import Toast from '@/components/Toast'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'

type Game = {
  id: string
  title: string
  game_type: string
  opponent_name: string | null
  team_id: string | null
  season_id: string | null
  location_id: string | null
  game_date: string | null
  game_time: string | null
  home_away: string
  score_us: number | null
  score_them: number | null
  result: string | null
  notes: string | null
}

type Team = { id: string; name: string }
type Season = { id: string; name: string }
type Location = { id: string; name: string }

const GAME_TYPES = ['All', 'game', 'tournament', 'scrimmage', 'playoff']
const GAME_TYPE_LABELS: Record<string, string> = {
  All: 'All',
  game: 'Games',
  tournament: 'Tournaments',
  scrimmage: 'Scrimmages',
  playoff: 'Playoffs',
}

const RESULT_COLORS: Record<string, string> = {
  win: 'bg-emerald-100 text-emerald-700',
  loss: 'bg-red-100 text-[#b80f0a]',
  tie: 'bg-gray-100 text-[#4a4a4a]',
  forfeit: 'bg-orange-100 text-orange-700',
  tbd: 'bg-[#f5f5f5] text-[#9b9b9b]',
}

function formatDate(date: string | null) {
  if (!date) return '—'
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function OrgGamesPage() {
  const supabase = createClientComponentClient()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  // Filters
  const [filterTeam, setFilterTeam] = useState('')
  const [filterSeason, setFilterSeason] = useState('')
  const [filterType, setFilterType] = useState('All')

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    title: '', game_type: 'game', opponent_name: '', team_id: '',
    season_id: '', location_id: '', game_date: '', game_time: '', home_away: 'home', notes: '',
  })

  // Score editing
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null)
  const [scoreDraft, setScoreDraft] = useState({ score_us: '', score_them: '', result: '' })
  const [savingScore, setSavingScore] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) return
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', userId)
        .maybeSingle()
      const oid = (membership as { org_id?: string } | null)?.org_id
      if (!oid || !active) return
      setOrgId(oid)

      const [gamesRes, teamsRes, seasonsRes, locationsRes] = await Promise.all([
        fetch('/api/org/games'),
        supabase.from('org_teams').select('id, name').eq('org_id', oid).order('name'),
        supabase.from('org_seasons').select('id, name').eq('org_id', oid).order('created_at', { ascending: false }),
        supabase.from('org_locations').select('id, name').eq('org_id', oid).order('name'),
      ])
      if (!active) return

      const gamesData = await gamesRes.json().catch(() => ({}))
      setGames(gamesData.games ?? [])
      setTeams((teamsRes.data || []) as Team[])
      setSeasons((seasonsRes.data || []) as Season[])
      setLocations((locationsRes.data || []) as Location[])
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [supabase])

  const filtered = games.filter((g) => {
    if (filterTeam && g.team_id !== filterTeam) return false
    if (filterSeason && g.season_id !== filterSeason) return false
    if (filterType !== 'All' && g.game_type !== filterType) return false
    return true
  })

  const handleCreate = useCallback(async () => {
    if (!form.title.trim() || creating) return
    setCreating(true)
    const res = await fetch('/api/org/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim(),
        game_type: form.game_type,
        opponent_name: form.opponent_name.trim() || null,
        team_id: form.team_id || null,
        season_id: form.season_id || null,
        location_id: form.location_id || null,
        game_date: form.game_date || null,
        game_time: form.game_time || null,
        home_away: form.home_away,
        notes: form.notes.trim() || null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setCreating(false)
    if (!res.ok) { setToast(data?.error || 'Failed to create game'); return }
    setGames((prev) => [...prev, data.game])
    setForm({ title: '', game_type: 'game', opponent_name: '', team_id: '', season_id: '', location_id: '', game_date: '', game_time: '', home_away: 'home', notes: '' })
    setShowForm(false)
    setToast('Game added')
  }, [form, creating])

  const handleSaveScore = useCallback(async () => {
    if (!editingScoreId || savingScore) return
    setSavingScore(true)
    const res = await fetch(`/api/org/games/${editingScoreId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score_us: scoreDraft.score_us !== '' ? Number(scoreDraft.score_us) : null,
        score_them: scoreDraft.score_them !== '' ? Number(scoreDraft.score_them) : null,
        result: scoreDraft.result || null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSavingScore(false)
    if (!res.ok) { setToast(data?.error || 'Failed to save score'); return }
    setGames((prev) => prev.map((g) => g.id === editingScoreId ? { ...g, ...data.game } : g))
    setEditingScoreId(null)
    setToast('Score saved')
  }, [editingScoreId, scoreDraft, savingScore])

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/org/games/${id}`, { method: 'DELETE' })
    if (!res.ok) { setToast('Failed to delete game'); return }
    setGames((prev) => prev.filter((g) => g.id !== id))
    setToast('Game deleted')
  }, [])

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? '—'
  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? null

  return (
    <div className="portal-inner">
      <div className="lg:hidden"><OrgSidebar /></div>
      <Toast message={toast} onClose={() => setToast('')} />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#191919]">Games &amp; tournaments</h1>
            <p className="mt-1 text-sm text-[#4a4a4a]">Track scheduled games, scores, and results.</p>
          </div>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white"
            >
              + Add game
            </button>
          )}
        </div>

        {/* Create form */}
        {showForm && (
          <div className="mb-6 rounded-2xl border border-[#dcdcdc] bg-white p-5">
            <p className="mb-4 text-sm font-semibold text-[#191919]">New game</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Title *</label>
                <input
                  className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                  placeholder="vs. City United"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Type</label>
                <select
                  className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                  value={form.game_type}
                  onChange={(e) => setForm((p) => ({ ...p, game_type: e.target.value }))}
                >
                  <option value="game">Game</option>
                  <option value="tournament">Tournament</option>
                  <option value="scrimmage">Scrimmage</option>
                  <option value="playoff">Playoff</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Opponent</label>
                <input
                  className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                  placeholder="Opponent team name"
                  value={form.opponent_name}
                  onChange={(e) => setForm((p) => ({ ...p, opponent_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Home / Away</label>
                <select
                  className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                  value={form.home_away}
                  onChange={(e) => setForm((p) => ({ ...p, home_away: e.target.value }))}
                >
                  <option value="home">Home</option>
                  <option value="away">Away</option>
                  <option value="neutral">Neutral site</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Date</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                  value={form.game_date}
                  onChange={(e) => setForm((p) => ({ ...p, game_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Time</label>
                <input
                  type="time"
                  className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                  value={form.game_time}
                  onChange={(e) => setForm((p) => ({ ...p, game_time: e.target.value }))}
                />
              </div>
              {teams.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Team</label>
                  <select
                    className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                    value={form.team_id}
                    onChange={(e) => setForm((p) => ({ ...p, team_id: e.target.value }))}
                  >
                    <option value="">No team</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              {seasons.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Season</label>
                  <select
                    className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                    value={form.season_id}
                    onChange={(e) => setForm((p) => ({ ...p, season_id: e.target.value }))}
                  >
                    <option value="">No season</option>
                    {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {locations.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Location</label>
                  <select
                    className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                    value={form.location_id}
                    onChange={(e) => setForm((p) => ({ ...p, location_id: e.target.value }))}
                  >
                    <option value="">No location</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Notes</label>
                <textarea
                  className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={!form.title.trim() || creating}
                onClick={handleCreate}
                className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? 'Adding...' : 'Add game'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full border border-[#dcdcdc] px-4 py-2 text-sm font-semibold text-[#4a4a4a]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-5 flex flex-wrap gap-2">
          {/* Game type chips */}
          {GAME_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${filterType === type ? 'bg-[#191919] text-white border-[#191919]' : 'bg-white text-[#4a4a4a] border-[#dcdcdc]'}`}
            >
              {GAME_TYPE_LABELS[type]}
            </button>
          ))}
          {teams.length > 0 && (
            <select
              className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-xs font-semibold text-[#4a4a4a]"
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
            >
              <option value="">All teams</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {seasons.length > 0 && (
            <select
              className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-xs font-semibold text-[#4a4a4a]"
              value={filterSeason}
              onChange={(e) => setFilterSeason(e.target.value)}
            >
              <option value="">All seasons</option>
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        {/* Game list */}
        {loading ? (
          <p className="text-sm text-[#9b9b9b]">Loading games...</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-[#dcdcdc] bg-white p-10 text-center">
            <p className="text-sm text-[#9b9b9b]">No games scheduled yet. Add your first game above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((game) => {
              const isEditingScore = editingScoreId === game.id
              const hasScore = game.score_us !== null && game.score_them !== null
              return (
                <div key={game.id} className="rounded-2xl border border-[#dcdcdc] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-[#191919]">{game.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${game.home_away === 'home' ? 'bg-emerald-100 text-emerald-700' : game.home_away === 'away' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-[#4a4a4a]'}`}>
                          {game.home_away === 'home' ? 'Home' : game.home_away === 'away' ? 'Away' : 'Neutral'}
                        </span>
                        <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-xs text-[#4a4a4a] capitalize">
                          {game.game_type}
                        </span>
                        {game.result && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${RESULT_COLORS[game.result] || 'bg-gray-100 text-[#4a4a4a]'}`}>
                            {game.result}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#4a4a4a]">
                        {game.opponent_name && <span>vs. {game.opponent_name}</span>}
                        {game.game_date && <span>{formatDate(game.game_date)}{game.game_time ? ` · ${game.game_time.slice(0, 5)}` : ''}</span>}
                        {game.team_id && <span>{teamName(game.team_id)}</span>}
                        {game.location_id && <span>{locationName(game.location_id)}</span>}
                        {hasScore && <span className="font-semibold text-[#191919]">{game.score_us}–{game.score_them}</span>}
                      </div>
                      {game.notes && <p className="mt-1 text-xs text-[#9b9b9b]">{game.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingScoreId(isEditingScore ? null : game.id)
                          setScoreDraft({
                            score_us: game.score_us !== null ? String(game.score_us) : '',
                            score_them: game.score_them !== null ? String(game.score_them) : '',
                            result: game.result || '',
                          })
                        }}
                        className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#4a4a4a]"
                      >
                        {isEditingScore ? 'Cancel' : hasScore ? 'Edit score' : 'Add score'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(game.id)}
                        className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs font-semibold text-[#b80f0a]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Score editor */}
                  {isEditingScore && (
                    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-[#f5f5f5] pt-3">
                      <div>
                        <label className="block text-xs text-[#4a4a4a] mb-1">Us</label>
                        <input
                          type="number"
                          min={0}
                          className="w-16 rounded-xl border border-[#dcdcdc] px-2 py-1.5 text-sm text-center"
                          value={scoreDraft.score_us}
                          onChange={(e) => setScoreDraft((p) => ({ ...p, score_us: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#4a4a4a] mb-1">Them</label>
                        <input
                          type="number"
                          min={0}
                          className="w-16 rounded-xl border border-[#dcdcdc] px-2 py-1.5 text-sm text-center"
                          value={scoreDraft.score_them}
                          onChange={(e) => setScoreDraft((p) => ({ ...p, score_them: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#4a4a4a] mb-1">Result</label>
                        <select
                          className="rounded-xl border border-[#dcdcdc] px-2 py-1.5 text-sm"
                          value={scoreDraft.result}
                          onChange={(e) => setScoreDraft((p) => ({ ...p, result: e.target.value }))}
                        >
                          <option value="">TBD</option>
                          <option value="win">Win</option>
                          <option value="loss">Loss</option>
                          <option value="tie">Tie</option>
                          <option value="forfeit">Forfeit</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        disabled={savingScore}
                        onClick={handleSaveScore}
                        className="rounded-full bg-[#191919] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {savingScore ? 'Saving...' : 'Save score'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
