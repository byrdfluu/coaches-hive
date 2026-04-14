'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { selectProfileCompat } from '@/lib/profileSchemaCompat'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import { useAthleteProfile } from '@/components/AthleteProfileContext'

type AthletePrivacySettings = {
  allowDirectMessages: boolean
  blockedCoaches: string
}

const defaultPrivacySettings: AthletePrivacySettings = {
  allowDirectMessages: true,
  blockedCoaches: '',
}

const sanitizePrivacySettings = (value?: unknown): AthletePrivacySettings => {
  const raw = value && typeof value === 'object' ? (value as Partial<Record<keyof AthletePrivacySettings, unknown>>) : {}
  return {
    allowDirectMessages: raw.allowDirectMessages !== false,
    blockedCoaches: typeof raw.blockedCoaches === 'string' ? raw.blockedCoaches : '',
  }
}

const defaultCommunicationSettings = {
  email: true,
  push: false,
}

type IntegrationSettings = {
  calendarProvider: 'none' | 'google'
  videoProvider: 'zoom' | 'google_meet' | 'custom'
  customVideoLink: string
  connections: {
    google: { connected: boolean; connected_at?: string }
    zoom: { connected: boolean; connected_at?: string }
  }
}

const defaultIntegrationSettings: IntegrationSettings = {
  calendarProvider: 'none',
  videoProvider: 'zoom',
  customVideoLink: '',
  connections: {
    google: { connected: false },
    zoom: { connected: false },
  },
}

type BundleVisibility = Record<string, string>

const formatAccountOwnerLabel = (value?: string | null) => {
  if (value === 'athlete_minor') return 'Athlete under 18'
  if (value === 'guardian') return 'Guardian-managed'
  return 'Athlete 18+'
}

const formatVideoProvider = (value: string) => {
  if (value === 'google_meet') return 'Google Meet'
  if (value === 'zoom') return 'Zoom'
  if (value === 'custom') return 'Custom link'
  return value
}

export default function AthleteProfilePage() {
  const supabase = createClientComponentClient()
  const {
    activeAthleteProfileId,
    activeSubProfileId,
    activeAthleteProfile,
    activeSubProfile,
    reloadProfiles,
  } = useAthleteProfile()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string>('Athlete')
  const [avatarUrl, setAvatarUrl] = useState<string>(() =>
    typeof window !== 'undefined'
      ? (window.localStorage.getItem('ch_avatar_url') || '/avatar-athlete-placeholder.png')
      : '/avatar-athlete-placeholder.png'
  )
  const [uploading, setUploading] = useState(false)
  const showUploadHint = avatarUrl.includes('placeholder')
  const [athleteSeason, setAthleteSeason] = useState('')
  const [athleteGrade, setAthleteGrade] = useState('')
  const [athleteBirthdate, setAthleteBirthdate] = useState('')
  const [athleteSport, setAthleteSport] = useState('')
  const [athleteLocation, setAthleteLocation] = useState('')
  const [bio, setBio] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianEmail, setGuardianEmail] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [accountOwnerType, setAccountOwnerType] = useState<string>('athlete_adult')
  const [privacySettings, setPrivacySettings] = useState<AthletePrivacySettings>(defaultPrivacySettings)
  const [communicationSettings, setCommunicationSettings] = useState(defaultCommunicationSettings)
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, { email?: boolean; push?: boolean }>>({})
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>(defaultIntegrationSettings)
  const [primaryCoachName, setPrimaryCoachName] = useState<string | null>(null)
  const [teamName, setTeamName] = useState<string | null>(null)
  const [metricsCount, setMetricsCount] = useState(0)
  const [resultsCount, setResultsCount] = useState(0)
  const [mediaCount, setMediaCount] = useState(0)
  const [visibility, setVisibility] = useState<BundleVisibility>({})
  const [resolvedAthleteProfileId, setResolvedAthleteProfileId] = useState<string | null>(null)
  const [visibilitySavingSection, setVisibilitySavingSection] = useState<string | null>(null)
  const [visibilityNotice, setVisibilityNotice] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const isSubProfileView = Boolean(activeAthleteProfileId)

  useEffect(() => {
    let mounted = true
    const loadProfile = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        if (mounted) setProfileLoading(false)
        return
      }
      if (mounted) {
        setCurrentUserId(data.user.id)
      }
      if (activeAthleteProfileId) {
        const response = await fetch(`/api/athlete/profiles/${activeAthleteProfileId}`, { cache: 'no-store' }).catch(() => null)
        const subProfile = response?.ok
          ? await response.json().catch(() => null) as {
              name?: string | null
              avatar_url?: string | null
              season?: string | null
              grade_level?: string | null
              birthdate?: string | null
              sport?: string | null
              location?: string | null
              bio?: string | null
            } | null
          : null
        if (!mounted) return
        const resolvedProfile = subProfile || activeAthleteProfile || activeSubProfile
        setDisplayName(resolvedProfile?.name || 'Athlete')
        setAvatarUrl(resolvedProfile?.avatar_url || '/avatar-athlete-placeholder.png')
        setAthleteSeason(resolvedProfile?.season || '')
        setAthleteGrade(resolvedProfile?.grade_level || '')
        setAthleteBirthdate(resolvedProfile?.birthdate || '')
        setAthleteSport(resolvedProfile?.sport || '')
        setAthleteLocation(resolvedProfile?.location || '')
        setBio(resolvedProfile?.bio || '')
        setGuardianName('')
        setGuardianEmail('')
        setGuardianPhone('')
        setAccountOwnerType('athlete_adult')
        setPrivacySettings(defaultPrivacySettings)
        setCommunicationSettings(defaultCommunicationSettings)
        setNotificationPrefs({})
        setIntegrationSettings(defaultIntegrationSettings)
        setPrimaryCoachName(null)
        setTeamName(null)
      }

      if (!activeAthleteProfileId) {
        const { data: profile } = await selectProfileCompat({
          supabase,
          userId: data.user.id,
          columns: [
            'full_name',
            'avatar_url',
            'athlete_season',
            'athlete_grade_level',
            'athlete_birthdate',
            'athlete_sport',
            'athlete_location',
            'bio',
            'guardian_name',
            'guardian_email',
            'guardian_phone',
            'account_owner_type',
            'notification_prefs',
            'athlete_privacy_settings',
            'athlete_communication_settings',
            'integration_settings',
          ],
        })
        const profileRow = (profile || null) as {
          full_name?: string | null
          avatar_url?: string | null
          athlete_season?: string | null
          athlete_grade_level?: string | null
          athlete_birthdate?: string | null
          athlete_sport?: string | null
          athlete_location?: string | null
          bio?: string | null
          guardian_name?: string | null
          guardian_email?: string | null
          guardian_phone?: string | null
          account_owner_type?: string | null
          notification_prefs?: Record<string, { email?: boolean; push?: boolean }> | null
          athlete_privacy_settings?: Partial<AthletePrivacySettings> | null
          athlete_communication_settings?: Partial<typeof defaultCommunicationSettings> | null
          integration_settings?: Partial<IntegrationSettings> | null
        } | null
        if (mounted && profileRow?.avatar_url) {
          setAvatarUrl(profileRow.avatar_url)
        }
        if (mounted) {
          setDisplayName(profileRow?.full_name || 'Athlete')
          setAthleteSeason(profileRow?.athlete_season || '')
          setAthleteGrade(profileRow?.athlete_grade_level || '')
          setAthleteBirthdate(profileRow?.athlete_birthdate || '')
          setAthleteSport(profileRow?.athlete_sport || '')
          setAthleteLocation(profileRow?.athlete_location || '')
          setBio(profileRow?.bio || '')
          setGuardianName(profileRow?.guardian_name || '')
          setGuardianEmail(profileRow?.guardian_email || '')
          setGuardianPhone(profileRow?.guardian_phone || '')
          setAccountOwnerType(profileRow?.account_owner_type || 'athlete_adult')
          setPrivacySettings(sanitizePrivacySettings(profileRow?.athlete_privacy_settings))
          setCommunicationSettings({
            ...defaultCommunicationSettings,
            ...(profileRow?.athlete_communication_settings || {}),
            push: false,
          })
          setNotificationPrefs(profileRow?.notification_prefs || {})
          setIntegrationSettings({
            ...defaultIntegrationSettings,
            ...(profileRow?.integration_settings || {}),
            connections: {
              ...defaultIntegrationSettings.connections,
              ...(profileRow?.integration_settings?.connections || {}),
            },
          })
        }
      }

      const bundleEndpoint = activeAthleteProfileId
        ? `/api/athlete/profile?athlete_profile_id=${encodeURIComponent(activeAthleteProfileId)}`
        : '/api/athlete/profile'
      const bundleResponse = await fetch(bundleEndpoint, { cache: 'no-store' }).catch(() => null)
      const bundle = bundleResponse?.ok
          ? await bundleResponse.json().catch(() => null) as {
            profile?: {
              athlete_profile_id?: string | null
              full_name?: string | null
              avatar_url?: string | null
              bio?: string | null
              athlete_sport?: string | null
              athlete_location?: string | null
              athlete_season?: string | null
              athlete_grade_level?: string | null
              athlete_birthdate?: string | null
            } | null
            metrics?: Array<unknown>
            results?: Array<unknown>
            media?: Array<unknown>
            visibility?: Record<string, string>
          } | null
        : null
      if (mounted) {
        const bundleProfile = bundle?.profile || null
        if (bundleProfile) {
          setDisplayName(bundleProfile.full_name || 'Athlete')
          setAvatarUrl(bundleProfile.avatar_url || '/avatar-athlete-placeholder.png')
          setResolvedAthleteProfileId(
            typeof bundleProfile.athlete_profile_id === 'string' && bundleProfile.athlete_profile_id.trim()
              ? bundleProfile.athlete_profile_id.trim()
              : null,
          )
          setAthleteSeason(bundleProfile.athlete_season || '')
          setAthleteGrade(bundleProfile.athlete_grade_level || '')
          setAthleteBirthdate(bundleProfile.athlete_birthdate || '')
          setAthleteSport(bundleProfile.athlete_sport || '')
          setAthleteLocation(bundleProfile.athlete_location || '')
          setBio(bundleProfile.bio || '')
        }
        setMetricsCount(Array.isArray(bundle?.metrics) ? bundle!.metrics!.length : 0)
        setResultsCount(Array.isArray(bundle?.results) ? bundle!.results!.length : 0)
        setMediaCount(Array.isArray(bundle?.media) ? bundle!.media!.length : 0)
        setVisibility((bundle?.visibility || {}) as BundleVisibility)
      }

      const [{ data: coachLink }, { data: teamLink }] = await Promise.all([
        supabase
          .from('coach_athlete_links')
          .select('coach_id, profiles!coach_athlete_links_coach_id_fkey(full_name)')
          .eq('athlete_id', data.user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('org_team_members')
          .select('team_id, org_teams!org_team_members_team_id_fkey(name)')
          .eq('athlete_id', data.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      if (mounted) {
        const coachProfile = (coachLink as any)?.profiles
        setPrimaryCoachName(coachProfile?.full_name || null)
        const orgTeam = (teamLink as any)?.org_teams
        setTeamName(orgTeam?.name || null)
        setProfileLoading(false)
      }
    }
    loadProfile()
    const onAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (typeof detail === 'object' && detail && typeof detail.url === 'string') {
        setAvatarUrl(detail.url)
      }
    }
    const onNameUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (typeof detail === 'object' && detail && typeof detail.name === 'string') {
        setDisplayName(detail.name)
      }
    }
    const onProfileUpdated = () => {
      loadProfile()
    }
    window.addEventListener('ch:avatar-updated', onAvatarUpdated)
    window.addEventListener('ch:name-updated', onNameUpdated)
    window.addEventListener('ch:profile-updated', onProfileUpdated)
    return () => {
      window.removeEventListener('ch:avatar-updated', onAvatarUpdated)
      window.removeEventListener('ch:name-updated', onNameUpdated)
      window.removeEventListener('ch:profile-updated', onProfileUpdated)
      mounted = false
    }
  }, [activeAthleteProfile, activeSubProfile, activeAthleteProfileId, supabase])

  const handleVisibilityToggle = useCallback(
    async (section: 'about' | 'metrics' | 'results' | 'media', nextVisible: boolean) => {
      if (!currentUserId) return
      setVisibilitySavingSection(section)
      setVisibilityNotice('')

      const targetVisibility = nextVisible ? 'public' : 'private'
      const baseQuery = supabase
        .from('profile_visibility')
        .select('id')
        .eq('athlete_id', currentUserId)
        .eq('section', section)

      const targetAthleteProfileId = activeAthleteProfileId || resolvedAthleteProfileId || currentUserId
      const existingResponse = await baseQuery.eq('athlete_profile_id', targetAthleteProfileId)

      if (existingResponse.error) {
        setVisibilitySavingSection(null)
        setVisibilityNotice('Unable to update sharing settings.')
        return
      }

      const existingId = existingResponse.data?.[0]?.id || null
      const payload: Record<string, unknown> = {
        athlete_id: currentUserId,
        athlete_profile_id: activeAthleteProfileId || resolvedAthleteProfileId || currentUserId,
        section,
        visibility: targetVisibility,
      }
      payload.sub_profile_id = activeSubProfileId || null

      const writeResponse = existingId
        ? await supabase.from('profile_visibility').update(payload).eq('id', existingId)
        : await supabase.from('profile_visibility').insert(payload)

      if (writeResponse.error) {
        const duplicateConstraint =
          typeof writeResponse.error.message === 'string' &&
          writeResponse.error.message.toLowerCase().includes('duplicate key')
        setVisibilitySavingSection(null)
        setVisibilityNotice(
          duplicateConstraint
            ? 'Sharing controls need the latest profile visibility migration before they can be saved for multiple athletes.'
            : 'Unable to update sharing settings.',
        )
        return
      }

      setVisibility((prev) => ({ ...prev, [section]: targetVisibility }))
      setVisibilitySavingSection(null)
      setVisibilityNotice('Sharing settings updated.')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ch:profile-updated', { detail: { athleteId: currentUserId, athlete_profile_id: activeAthleteProfileId || resolvedAthleteProfileId || currentUserId, sub_profile_id: activeSubProfileId } }))
      }
    },
    [activeAthleteProfileId, activeSubProfileId, currentUserId, resolvedAthleteProfileId, supabase],
  )

  const handleAvatarChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const targetAthleteProfileId = activeAthleteProfileId || resolvedAthleteProfileId
    if (targetAthleteProfileId) {
      formData.append('athlete_profile_id', targetAthleteProfileId)
    }
    if (activeSubProfileId) {
      formData.append('sub_profile_id', activeSubProfileId)
    }
    const response = await fetch('/api/storage/avatar', {
      method: 'POST',
      body: formData,
    })
    if (response.ok) {
      const data = await response.json()
      setAvatarUrl(data.url)
      if (typeof window !== 'undefined') {
        if (activeAthleteProfileId) {
          await reloadProfiles()
        } else {
          window.localStorage.setItem('ch_avatar_url', data.url)
          window.dispatchEvent(new CustomEvent('ch:avatar-updated', { detail: { url: data.url } }))
        }
      }
    }
    setUploading(false)
    event.target.value = ''
  }, [activeAthleteProfileId, activeSubProfileId, reloadProfiles, resolvedAthleteProfileId])

  const enabledNotificationCategories = Object.entries(notificationPrefs)
    .filter(([, value]) => Boolean(value?.email || value?.push))
    .map(([key]) => key.replace(/_/g, ' '))

  const blockedCoachCount = privacySettings.blockedCoaches
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean).length

  const subtitleParts = [athleteLocation, athleteSport, athleteSeason].filter(Boolean)

  const birthdateFormatted = athleteBirthdate
    ? new Date(`${athleteBirthdate}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  const hasGuardian = Boolean(guardianName || guardianEmail || guardianPhone)
  const profileTitle = isSubProfileView ? 'Linked athlete profile' : 'Athlete Profile'
  const sharingSections = [
    { key: 'about' as const, label: 'About + details', description: 'Bio, location, season, grade, and profile details.', countLabel: 'Core profile' },
    { key: 'metrics' as const, label: 'Performance metrics', description: 'Numbers and benchmarks on the profile.', countLabel: `${metricsCount} item${metricsCount === 1 ? '' : 's'}` },
    { key: 'results' as const, label: 'Recent results', description: 'Competition results and placements.', countLabel: `${resultsCount} item${resultsCount === 1 ? '' : 's'}` },
    { key: 'media' as const, label: 'Highlights', description: 'Images and highlight links.', countLabel: `${mediaCount} item${mediaCount === 1 ? '' : 's'}` },
  ]

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />

        {/* MAIN GRID */}
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />

          <div className="space-y-6">

            {profileLoading && (
              <div className="space-y-6 animate-pulse">
                <div className="glass-card border border-[#dcdcdc] bg-white p-5">
                  <div className="flex items-start gap-4">
                    <div className="h-20 w-20 shrink-0 rounded-full bg-[#e8e8e8]" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-5 w-40 rounded bg-[#e8e8e8]" />
                      <div className="h-4 w-56 rounded bg-[#e8e8e8]" />
                    </div>
                  </div>
                </div>
                <div className="glass-card border border-[#dcdcdc] bg-white p-5 space-y-3">
                  <div className="h-4 w-24 rounded bg-[#e8e8e8]" />
                  <div className="h-4 w-full rounded bg-[#e8e8e8]" />
                  <div className="h-4 w-3/4 rounded bg-[#e8e8e8]" />
                </div>
                <div className="glass-card border border-[#dcdcdc] bg-white p-5 space-y-3">
                  <div className="h-4 w-24 rounded bg-[#e8e8e8]" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-4 rounded bg-[#e8e8e8]" />
                    <div className="h-4 rounded bg-[#e8e8e8]" />
                    <div className="h-4 rounded bg-[#e8e8e8]" />
                    <div className="h-4 rounded bg-[#e8e8e8]" />
                  </div>
                </div>
              </div>
            )}

            {!profileLoading && (
            <>

            {/* HERO CARD */}
            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-wrap items-start gap-4">
                  <label
                    className="relative block h-20 w-20 shrink-0 cursor-pointer rounded-full border-2 border-[#191919] bg-[#e8e8e8] bg-cover bg-center"
                    style={{ backgroundImage: `url(${avatarUrl})` }}
                  >
                    {showUploadHint && (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl font-semibold text-[#191919] opacity-30">
                        +
                      </span>
                    )}
                    <input
                      type="file"
                      className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                      aria-label="Upload profile photo"
                      onChange={handleAvatarChange}
                    />
                  </label>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{profileTitle}</p>
                    <h1 className="display text-3xl font-semibold text-[#191919]">{displayName}</h1>
                    {subtitleParts.length > 0 && (
                      <p className="mt-1 text-sm text-[#4a4a4a]">{subtitleParts.join(' · ')}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {athleteSport && (
                        <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                          {athleteSport}
                        </span>
                      )}
                      {athleteSeason && (
                        <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                          Seasons: {athleteSeason}
                        </span>
                      )}
                      {athleteGrade && (
                        <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                          Grade: {athleteGrade}
                        </span>
                      )}
                      {!isSubProfileView && (
                        <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-[#4a4a4a]">
                          {formatAccountOwnerLabel(accountOwnerType)}
                        </span>
                      )}
                      {uploading && (
                        <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-[#4a4a4a]">
                          Uploading...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 text-sm">
                  {primaryCoachName ? (
                    <Link
                      href={activeAthleteProfileId ? `/athlete/messages?athlete_profile_id=${encodeURIComponent(activeAthleteProfileId)}` : '/athlete/messages'}
                      className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Message coach
                    </Link>
                  ) : (
                    <Link
                      href={activeAthleteProfileId ? `/athlete/messages?athlete_profile_id=${encodeURIComponent(activeAthleteProfileId)}` : '/athlete/messages'}
                      className="rounded-full border border-[#dcdcdc] px-4 py-2 font-semibold text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919] transition-colors"
                    >
                      Open messages
                    </Link>
                  )}
                  <Link
                    href={activeAthleteProfileId ? `/athlete/calendar?athlete_profile_id=${encodeURIComponent(activeAthleteProfileId)}` : '/athlete/calendar'}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white hover:opacity-90 transition-opacity"
                  >
                    Book session
                  </Link>
                </div>
              </div>
            </section>

            {/* ABOUT / INFO / CONNECTIONS — 3-col */}
            <section className="glass-card border border-[#191919] bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Athlete Profile</p>
              <h2 className="mt-1 text-xl font-semibold text-[#191919]">About</h2>
              <div className="mt-4 grid gap-6 md:grid-cols-3 text-sm">
                {/* About column */}
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">About</p>
                  {bio ? (
                    <p className="mt-2 text-[#4a4a4a] leading-relaxed">{bio}</p>
                  ) : (
                    <p className="mt-2 text-[#4a4a4a]">
                      No bio yet.{' '}
                      <Link href="/athlete/settings" className="font-semibold underline text-[#191919]">
                        Add one →
                      </Link>
                    </p>
                  )}
                </div>

                {/* Info column */}
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Info</p>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[#4a4a4a]">Sport</span>
                      <span className="font-semibold text-[#191919] text-right">{athleteSport || 'Not set'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[#4a4a4a]">Season</span>
                      <span className="font-semibold text-[#191919] text-right">{athleteSeason || 'Not set'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[#4a4a4a]">Grade</span>
                      <span className="font-semibold text-[#191919] text-right">{athleteGrade || 'Not set'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[#4a4a4a]">Date of birth</span>
                      <span className="font-semibold text-[#191919] text-right">{birthdateFormatted || 'Not set'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[#4a4a4a]">Profile type</span>
                      <span className="font-semibold text-[#191919] text-right">
                        {isSubProfileView ? 'Linked athlete profile' : formatAccountOwnerLabel(accountOwnerType)}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Sharing</p>
                  <h2 className="mt-1 text-xl font-semibold text-[#191919]">Public visibility</h2>
                  <p className="mt-2 text-sm text-[#4a4a4a]">
                    Choose what coaches and public-facing profile views can see for the currently selected athlete.
                  </p>
                </div>
                <Link
                  href="/athlete/settings#privacy"
                  className="rounded-full border border-[#191919] px-4 py-2 text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
                >
                  More privacy settings
                </Link>
              </div>
              {visibilityNotice ? (
                <p className="mt-3 text-xs text-[#6b5f55]">{visibilityNotice}</p>
              ) : null}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {sharingSections.map((section) => {
                  const isPublic = (visibility[section.key] || 'public') === 'public'
                  const isSaving = visibilitySavingSection === section.key
                  return (
                    <div key={section.key} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#191919]">{section.label}</p>
                          <p className="mt-1 text-sm text-[#4a4a4a]">{section.description}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[#6b5f55]">{section.countLabel}</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isPublic}
                          disabled={isSaving}
                          onClick={() => handleVisibilityToggle(section.key, !isPublic)}
                          className={`inline-flex min-h-[36px] min-w-[90px] items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                            isPublic
                              ? 'border-[#191919] bg-[#191919] text-white'
                              : 'border-[#dcdcdc] bg-white text-[#191919]'
                          } disabled:opacity-60`}
                        >
                          {isSaving ? 'Saving...' : isPublic ? 'Public' : 'Hidden'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* GUARDIAN — conditional, 3 stat boxes */}
            {!isSubProfileView && hasGuardian && (
              <section className="glass-card border border-[#191919] bg-white p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Family</p>
                <h2 className="mt-1 text-xl font-semibold text-[#191919]">Guardian</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm">
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Name</p>
                    <p className="mt-1 font-semibold text-[#191919]">{guardianName || 'Not set'}</p>
                  </div>
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Email</p>
                    <p className="mt-1 font-semibold text-[#191919] break-all">{guardianEmail || 'Not set'}</p>
                  </div>
                  <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Phone</p>
                    <p className="mt-1 font-semibold text-[#191919]">{guardianPhone || 'Not set'}</p>
                  </div>
                </div>
              </section>
            )}

            {/* PREFERENCES — 3 stat boxes */}
            {!isSubProfileView && (
            <section className="glass-card border border-[#191919] bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Account</p>
              <h2 className="mt-1 text-xl font-semibold text-[#191919]">Preferences</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Privacy</p>
                  <div className="mt-2 space-y-1 text-[#191919]">
                    <p>Direct messages: {privacySettings.allowDirectMessages ? 'Allowed' : 'Off'}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Communication</p>
                  <div className="mt-2 space-y-1 text-[#191919]">
                    <p>Email updates: {communicationSettings.email ? 'On' : 'Off'}</p>
                    <p>Notifications: {enabledNotificationCategories.length ? enabledNotificationCategories.length : 'None'} enabled</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Integrations</p>
                  <div className="mt-2 space-y-1 text-[#191919]">
                    <p>Calendar: {integrationSettings.calendarProvider}</p>
                    <p>Video: {formatVideoProvider(integrationSettings.videoProvider)}</p>
                    <p>Google: {integrationSettings.connections.google.connected ? 'Connected' : 'Not connected'}</p>
                  </div>
                </div>
              </div>
            </section>
            )}

            {/* PROGRAMS */}
            <section className="glass-card border border-[#191919] bg-white p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Training</p>
              <h2 className="mt-1 text-xl font-semibold text-[#191919]">Current programs</h2>
              <div className="mt-3 text-sm">
                <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] px-4 py-6 text-center text-[#4a4a4a]">
                  No active programs yet.
                </div>
              </div>
            </section>

            </>
            )}

          </div>
        </div>
      </div>
    </main>
  )
}
