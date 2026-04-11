'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import Image from 'next/image'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { ChangeEvent } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import Toast from '@/components/Toast'

type AthleteMetric = {
  id: string
  athlete_id: string
  label: string
  value: string
  unit?: string | null
  sort_order?: number | null
}

type AthleteResult = {
  id: string
  athlete_id: string
  title: string
  event_date?: string | null
  placement?: string | null
  detail?: string | null
}

type AthleteMedia = {
  id: string
  athlete_id: string
  title?: string | null
  media_url: string
  media_type?: string | null
}

type VisibilityRow = {
  section: string
  visibility: string
}

const formatAccountOwnerLabel = (value?: string | null) => {
  if (value === 'athlete_minor') return 'Athlete under 18'
  if (value === 'guardian') return 'Guardian-managed'
  return 'Athlete 18+'
}

export default function AthleteProfileDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  use(params)
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const athleteId = searchParams.get('id')
  const subProfileId = searchParams.get('sub_profile_id')
  const queryName = searchParams.get('name') || ''
  const querySport = searchParams.get('sport') || ''
  const [profileName, setProfileName] = useState(queryName || 'Athlete')
  const [profileSport, setProfileSport] = useState<string | null>(querySport || null)
  const displayName = profileName || queryName || 'Athlete'
  const displaySport = profileSport || querySport
  const displaySubtitle = displaySport ? `Athlete details · ${displaySport}` : 'Athlete details'
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string>(() =>
    typeof window !== 'undefined'
      ? (subProfileId ? '/avatar-athlete-placeholder.png' : (window.localStorage.getItem('ch_avatar_url') || '/avatar-athlete-placeholder.png'))
      : '/avatar-athlete-placeholder.png'
  )
  const [avatarUploading, setAvatarUploading] = useState(false)
  const showUploadHint = avatarUrl.includes('placeholder')
  const [metrics, setMetrics] = useState<AthleteMetric[]>([])
  const [results, setResults] = useState<AthleteResult[]>([])
  const [media, setMedia] = useState<AthleteMedia[]>([])
  const [visibilityRows, setVisibilityRows] = useState<VisibilityRow[]>([])
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [savedNotes, setSavedNotes] = useState<Array<{ id: string; note: string; created_at: string }>>([])
  const [showAddMetric, setShowAddMetric] = useState(false)
  const [newMetricLabel, setNewMetricLabel] = useState('')
  const [newMetricValue, setNewMetricValue] = useState('')
  const [newMetricUnit, setNewMetricUnit] = useState('')
  const [addMetricLoading, setAddMetricLoading] = useState(false)
  const [showAddResult, setShowAddResult] = useState(false)
  const [newResultTitle, setNewResultTitle] = useState('')
  const [newResultDate, setNewResultDate] = useState('')
  const [newResultPlacement, setNewResultPlacement] = useState('')
  const [newResultDetail, setNewResultDetail] = useState('')
  const [addResultLoading, setAddResultLoading] = useState(false)
  const [showAddMedia, setShowAddMedia] = useState(false)
  const [newMediaUrl, setNewMediaUrl] = useState('')
  const [newMediaTitle, setNewMediaTitle] = useState('')
  const [addMediaLoading, setAddMediaLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [athleteSeason, setAthleteSeason] = useState<string | null>(null)
  const [athleteGradeLevel, setAthleteGradeLevel] = useState<string | null>(null)
  const [athleteBirthdate, setAthleteBirthdate] = useState<string | null>(null)
  const [athleteLocation, setAthleteLocation] = useState<string | null>(null)
  const [bio, setBio] = useState<string | null>(null)
  const [guardianName, setGuardianName] = useState<string | null>(null)
  const [guardianEmail, setGuardianEmail] = useState<string | null>(null)
  const [guardianPhone, setGuardianPhone] = useState<string | null>(null)
  const [accountOwnerType, setAccountOwnerType] = useState<string | null>(null)
  const resolvedAthleteId = athleteId || currentUserId
  const profileHighlights = useMemo(
    () => [displaySport, athleteSeason, athleteGradeLevel ? `Grade ${athleteGradeLevel}` : null].filter(Boolean) as string[],
    [athleteGradeLevel, athleteSeason, displaySport],
  )

  useEffect(() => {
    let mounted = true
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (mounted) {
        setCurrentUserId(data.user?.id ?? null)
      }
    }
    loadUser()
    return () => {
      mounted = false
    }
  }, [supabase])

  useEffect(() => {
    let mounted = true

    const loadProfileDetails = async () => {
      const endpoint = subProfileId
        ? `/api/athlete/profile?sub_profile_id=${encodeURIComponent(subProfileId)}`
        : '/api/athlete/profile'
      const response = await fetch(endpoint, { cache: 'no-store' }).catch(() => null)

      if (!mounted) return

      if (!response?.ok) {
        setProfileName(queryName || 'Athlete')
        setProfileSport(querySport || null)
        setAvatarUrl('/avatar-athlete-placeholder.png')
        setAthleteSeason(null)
        setAthleteGradeLevel(null)
        setAthleteBirthdate(null)
        setAthleteLocation(null)
        setBio(null)
        setGuardianName(null)
        setGuardianEmail(null)
        setGuardianPhone(null)
        setAccountOwnerType(null)
        setMetrics([])
        setResults([])
        setMedia([])
        setVisibilityRows([])
        return
      }

      const payload = await response.json().catch(() => null)
      const normalizedProfile = (payload?.profile || null) as {
        full_name?: string | null
        avatar_url?: string | null
        bio?: string | null
        athlete_sport?: string | null
        athlete_location?: string | null
        athlete_season?: string | null
        athlete_grade_level?: string | null
        athlete_birthdate?: string | null
        guardian_name?: string | null
        guardian_email?: string | null
        guardian_phone?: string | null
        account_owner_type?: string | null
      } | null

      const activeAvatarUrl = normalizedProfile?.avatar_url || null

      setProfileName(normalizedProfile?.full_name || queryName || 'Athlete')
      setProfileSport(normalizedProfile?.athlete_sport || querySport || null)
      setAvatarUrl(activeAvatarUrl || '/avatar-athlete-placeholder.png')
      setAthleteSeason(normalizedProfile?.athlete_season || null)
      setAthleteGradeLevel(normalizedProfile?.athlete_grade_level || null)
      setAthleteBirthdate(normalizedProfile?.athlete_birthdate || null)
      setAthleteLocation(normalizedProfile?.athlete_location || null)
      setBio(normalizedProfile?.bio || null)
      setGuardianName(normalizedProfile?.guardian_name || null)
      setGuardianEmail(normalizedProfile?.guardian_email || null)
      setGuardianPhone(normalizedProfile?.guardian_phone || null)
      setAccountOwnerType(normalizedProfile?.account_owner_type || null)
      setMetrics((payload?.metrics || []) as AthleteMetric[])
      setResults((payload?.results || []) as AthleteResult[])
      setMedia((payload?.media || []) as AthleteMedia[])
      setVisibilityRows(
        Object.entries((payload?.visibility || {}) as Record<string, string>).map(([section, visibility]) => ({
          section,
          visibility,
        })),
      )

      if (!subProfileId && activeAvatarUrl && typeof window !== 'undefined') {
        window.localStorage.setItem('ch_avatar_url', activeAvatarUrl)
      }
    }

    const onAvatarUpdated = (event: Event) => {
      if (subProfileId) return
      const detail = (event as CustomEvent).detail as { url?: string } | undefined
      if (detail?.url) {
        setAvatarUrl(detail.url)
      }
    }

    const onProfileUpdated = () => {
      loadProfileDetails()
    }

    loadProfileDetails()
    if (!subProfileId) {
      window.addEventListener('ch:avatar-updated', onAvatarUpdated)
    }
    window.addEventListener('ch:profile-updated', onProfileUpdated)
    return () => {
      mounted = false
      if (!subProfileId) {
        window.removeEventListener('ch:avatar-updated', onAvatarUpdated)
      }
      window.removeEventListener('ch:profile-updated', onProfileUpdated)
    }
  }, [queryName, querySport, subProfileId, supabase])

  useEffect(() => {
    if (!resolvedAthleteId) return
    let active = true
    const loadNotes = async () => {
      const notesQ = supabase
        .from('athlete_progress_notes')
        .select('id, note, created_at')
        .eq('athlete_id', resolvedAthleteId)
        .order('created_at', { ascending: false })
        .limit(10)
      const { data } = await (subProfileId ? notesQ.eq('sub_profile_id', subProfileId) : notesQ.is('sub_profile_id', null))
      if (active) setSavedNotes((data || []) as Array<{ id: string; note: string; created_at: string }>)
    }
    loadNotes()
    return () => { active = false }
  }, [resolvedAthleteId, subProfileId, supabase])

  const visibilityMap = useMemo(() => {
    const map = new Map<string, string>()
    visibilityRows.forEach((row) => map.set(row.section, row.visibility))
    return map
  }, [visibilityRows])

  const isPublicSection = useCallback(
    (section: string) => {
      const value = visibilityMap.get(section) || 'public'
      return value === 'public'
    },
    [visibilityMap]
  )

  const handleAvatarChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    if (subProfileId) {
      formData.append('sub_profile_id', subProfileId)
    }
    const response = await fetch('/api/storage/avatar', {
      method: 'POST',
      body: formData,
    })
    if (response.ok) {
      const data = await response.json()
      setAvatarUrl(data.url)
      if (typeof window !== 'undefined') {
        if (subProfileId) {
          const profilesResponse = await fetch('/api/athlete/profiles', { cache: 'no-store' }).catch(() => null)
          const nextProfiles = profilesResponse?.ok ? await profilesResponse.json().catch(() => []) : []
          window.dispatchEvent(new CustomEvent('ch:athlete-profiles-updated', { detail: { profiles: nextProfiles } }))
        } else {
          window.localStorage.setItem('ch_avatar_url', data.url)
          window.dispatchEvent(new CustomEvent('ch:avatar-updated', { detail: { url: data.url } }))
        }
      }
    }
    setAvatarUploading(false)
    event.target.value = ''
  }, [subProfileId])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="relative block h-16 w-16 cursor-pointer rounded-full border-2 border-[#191919] bg-[#e8e8e8] bg-cover bg-center" style={{ backgroundImage: `url(${avatarUrl})` }}>
              {showUploadHint && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl font-semibold text-[#191919] opacity-30">
                  +
                </span>
              )}
              <input type="file" className="absolute inset-0 h-full w-full opacity-0 cursor-pointer" aria-label="Upload profile photo" onChange={handleAvatarChange} />
            </label>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athlete Profile</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">{displayName}</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">{displaySubtitle}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {profileHighlights.map((item) => (
                <span key={item} className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                  {item}
                </span>
              ))}
              {avatarUploading && (
                <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs text-[#4a4a4a]">
                  Uploading...
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href={subProfileId ? `/athlete/messages?sub_profile_id=${encodeURIComponent(subProfileId)}` : '/athlete/messages'}
              className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Message coach
            </Link>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-5">
              <h2 className="text-xl font-semibold text-[#191919]">About</h2>
              <p className="mt-3 text-sm text-[#4a4a4a]">
                {bio || 'No bio added yet.'}
              </p>
              {(athleteSeason || athleteGradeLevel || athleteBirthdate || athleteLocation || accountOwnerType) && (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm">
                  {accountOwnerType && (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Account owner</p>
                      <p className="mt-1 font-semibold text-[#191919]">{formatAccountOwnerLabel(accountOwnerType)}</p>
                    </div>
                  )}
                  {athleteSeason && (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Season</p>
                      <p className="mt-1 font-semibold text-[#191919]">{athleteSeason}</p>
                    </div>
                  )}
                  {athleteGradeLevel && (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Grade level</p>
                      <p className="mt-1 font-semibold text-[#191919]">{athleteGradeLevel}</p>
                    </div>
                  )}
                  {athleteBirthdate && (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Date of birth</p>
                      <p className="mt-1 font-semibold text-[#191919]">{new Date(athleteBirthdate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                  )}
                  {athleteLocation && (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Location</p>
                      <p className="mt-1 font-semibold text-[#191919]">{athleteLocation}</p>
                    </div>
                  )}
                </div>
              )}
              {(guardianName || guardianEmail || guardianPhone) && (
                <div className="mt-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Guardian</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <p className="font-semibold text-[#191919]">{guardianName || 'Not set'}</p>
                    <p className="text-[#4a4a4a]">{guardianEmail || 'No email listed'}</p>
                    <p className="text-[#4a4a4a]">{guardianPhone || 'No phone listed'}</p>
                  </div>
                </div>
              )}
            </section>

            {isPublicSection('metrics') && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-[#191919]">Performance metrics</h2>
                  <button
                    type="button"
                    onClick={() => setShowAddMetric((v) => !v)}
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    {showAddMetric ? 'Cancel' : 'Add metric'}
                  </button>
                </div>
                {showAddMetric && (
                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    <input
                      type="text"
                      placeholder="Label (e.g. 40-yard dash)"
                      value={newMetricLabel}
                      onChange={(e) => setNewMetricLabel(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Value (e.g. 4.8)"
                      value={newMetricValue}
                      onChange={(e) => setNewMetricValue(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Unit (e.g. sec)"
                      value={newMetricUnit}
                      onChange={(e) => setNewMetricUnit(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={addMetricLoading || !newMetricLabel.trim() || !newMetricValue.trim()}
                      onClick={async () => {
                        if (!resolvedAthleteId) return
                        setAddMetricLoading(true)
                        const row: Record<string, unknown> = {
                          athlete_id: resolvedAthleteId,
                          label: newMetricLabel.trim(),
                          value: newMetricValue.trim(),
                          sort_order: metrics.length,
                        }
                        if (newMetricUnit.trim()) row.unit = newMetricUnit.trim()
                        if (subProfileId) row.sub_profile_id = subProfileId
                        const { data: inserted, error } = await supabase
                          .from('athlete_metrics')
                          .insert(row)
                          .select('id, athlete_id, label, value, unit, sort_order')
                          .single()
                        setAddMetricLoading(false)
                        if (error) { setToast('Unable to add metric.'); return }
                        setMetrics((prev) => [...prev, inserted as AthleteMetric])
                        setNewMetricLabel(''); setNewMetricValue(''); setNewMetricUnit('')
                        setShowAddMetric(false)
                      }}
                      className="rounded-full bg-[#b80f0a] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
                    >
                      {addMetricLoading ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {metrics.length === 0 ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                      No metrics yet.
                    </div>
                  ) : (
                    metrics.map((metric) => (
                      <div key={metric.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">{metric.label}</p>
                        <p className="mt-1 text-lg font-semibold text-[#191919]">
                          {metric.value}{metric.unit ? ` ${metric.unit}` : ''}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {isPublicSection('results') && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-[#191919]">Recent results</h2>
                  <button
                    type="button"
                    onClick={() => setShowAddResult((v) => !v)}
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    {showAddResult ? 'Cancel' : 'Add result'}
                  </button>
                </div>
                {showAddResult && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <input
                      type="text"
                      placeholder="Event / competition name"
                      value={newResultTitle}
                      onChange={(e) => setNewResultTitle(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <input
                      type="date"
                      value={newResultDate}
                      onChange={(e) => setNewResultDate(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Placement (e.g. 1st, Top 10)"
                      value={newResultPlacement}
                      onChange={(e) => setNewResultPlacement(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Notes / detail (optional)"
                      value={newResultDetail}
                      onChange={(e) => setNewResultDetail(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={addResultLoading || !newResultTitle.trim()}
                      onClick={async () => {
                        if (!resolvedAthleteId) return
                        setAddResultLoading(true)
                        const row: Record<string, unknown> = {
                          athlete_id: resolvedAthleteId,
                          title: newResultTitle.trim(),
                        }
                        if (newResultDate) row.event_date = newResultDate
                        if (newResultPlacement.trim()) row.placement = newResultPlacement.trim()
                        if (newResultDetail.trim()) row.detail = newResultDetail.trim()
                        if (subProfileId) row.sub_profile_id = subProfileId
                        const { data: inserted, error } = await supabase
                          .from('athlete_results')
                          .insert(row)
                          .select('id, athlete_id, title, event_date, placement, detail')
                          .single()
                        setAddResultLoading(false)
                        if (error) { setToast('Unable to add result.'); return }
                        setResults((prev) => [inserted as AthleteResult, ...prev])
                        setNewResultTitle(''); setNewResultDate(''); setNewResultPlacement(''); setNewResultDetail('')
                        setShowAddResult(false)
                      }}
                      className="rounded-full bg-[#b80f0a] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity md:col-span-2"
                    >
                      {addResultLoading ? 'Saving...' : 'Save result'}
                    </button>
                  </div>
                )}
                <div className="mt-4 space-y-3 text-sm">
                  {results.length === 0 ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                      No results posted.
                    </div>
                  ) : (
                    results.map((result) => (
                      <div key={result.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <p className="font-semibold text-[#191919]">{result.title}</p>
                        <p className="text-xs text-[#4a4a4a]">
                          {result.event_date ? new Date(result.event_date).toLocaleDateString() : 'Date TBD'}
                          {result.placement ? ` · ${result.placement}` : ''}
                        </p>
                        {result.detail && (
                          <p className="mt-1 text-xs text-[#4a4a4a]">{result.detail}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {isPublicSection('media') && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-[#191919]">Highlights</h2>
                  <button
                    type="button"
                    onClick={() => setShowAddMedia((v) => !v)}
                    className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                  >
                    {showAddMedia ? 'Cancel' : 'Add highlight'}
                  </button>
                </div>
                {showAddMedia && (
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <input
                      type="url"
                      placeholder="Image or video URL"
                      value={newMediaUrl}
                      onChange={(e) => setNewMediaUrl(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none md:col-span-2"
                    />
                    <input
                      type="text"
                      placeholder="Title (optional)"
                      value={newMediaTitle}
                      onChange={(e) => setNewMediaTitle(e.target.value)}
                      className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={addMediaLoading || !newMediaUrl.trim()}
                      onClick={async () => {
                        if (!resolvedAthleteId) return
                        setAddMediaLoading(true)
                        const row: Record<string, unknown> = {
                          athlete_id: resolvedAthleteId,
                          media_url: newMediaUrl.trim(),
                          media_type: 'image',
                        }
                        if (newMediaTitle.trim()) row.title = newMediaTitle.trim()
                        if (subProfileId) row.sub_profile_id = subProfileId
                        const { data: inserted, error } = await supabase
                          .from('athlete_media')
                          .insert(row)
                          .select('id, athlete_id, title, media_url, media_type')
                          .single()
                        setAddMediaLoading(false)
                        if (error) { setToast('Unable to add highlight.'); return }
                        setMedia((prev) => [inserted as AthleteMedia, ...prev])
                        setNewMediaUrl(''); setNewMediaTitle('')
                        setShowAddMedia(false)
                      }}
                      className="rounded-full bg-[#b80f0a] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity md:col-span-3"
                    >
                      {addMediaLoading ? 'Saving...' : 'Save highlight'}
                    </button>
                  </div>
                )}
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {media.length === 0 ? (
                    <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-xs text-[#4a4a4a]">
                      No highlights uploaded.
                    </div>
                  ) : (
                    media.slice(0, 6).map((item) => (
                      <a
                        key={item.id}
                        href={item.media_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-[#dcdcdc] bg-white p-3 text-sm hover:border-[#191919]"
                      >
                        <div className="relative h-24 w-full rounded-xl bg-[#f5f5f5]">
                          <Image
                            src={item.media_url}
                            alt={item.title || 'Highlight'}
                            fill
                            sizes="(max-width: 1024px) 100vw, 200px"
                            className="rounded-xl object-cover"
                          />
                        </div>
                        <p className="mt-2 text-xs font-semibold text-[#191919]">{item.title || 'Highlight'}</p>
                      </a>
                    ))
                  )}
                </div>
              </section>
            )}

            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[#191919]">Progress notes</h2>
                <button
                  type="button"
                  disabled={noteSaving}
                  onClick={async () => {
                    if (!noteText.trim()) {
                      setToast('Add a note before saving.')
                      return
                    }
                    if (!resolvedAthleteId) return
                    setNoteSaving(true)
                    const row: Record<string, unknown> = { athlete_id: resolvedAthleteId, note: noteText.trim() }
                    if (subProfileId) row.sub_profile_id = subProfileId
                    const { data: inserted, error } = await supabase
                      .from('athlete_progress_notes')
                      .insert(row)
                      .select('id, note, created_at')
                      .single()
                    setNoteSaving(false)
                    if (error) {
                      setToast('Unable to save note.')
                      return
                    }
                    const savedNote = inserted as { id: string; note: string; created_at: string }
                    setSavedNotes((prev) => [savedNote, ...prev])
                    setNoteText('')
                    setToast('Note saved.')
                  }}
                  className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors disabled:opacity-60"
                >
                  {noteSaving ? 'Saving...' : 'Save note'}
                </button>
              </div>
              <p className="mt-2 text-sm text-[#4a4a4a]">Track weekly wins, challenges, and adjustments.</p>
              <textarea
                rows={3}
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                className="mt-4 w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                placeholder="Add a new progress note..."
              />
              <div className="mt-4 space-y-3 text-sm">
                {savedNotes.length === 0 ? (
                  <p className="text-xs text-[#4a4a4a]">No notes yet. Add your first note above.</p>
                ) : (
                  savedNotes.map((n) => (
                    <div key={n.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                      <p className="text-sm text-[#191919]">{n.note}</p>
                      <p className="mt-1 text-xs text-[#4a4a4a]">{new Date(n.created_at).toLocaleDateString()}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </main>
  )
}
