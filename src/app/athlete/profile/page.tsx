'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'

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

const formatAccountOwnerLabel = (value?: string | null) => {
  if (value === 'athlete_minor') return 'Athlete under 18'
  if (value === 'guardian') return 'Guardian-managed'
  return 'Athlete 18+'
}

export default function AthleteProfilePage() {
  const supabase = createClientComponentClient()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string>('Athlete')
  const [avatarUrl, setAvatarUrl] = useState<string>('/avatar-athlete-placeholder.png')
  const [uploading, setUploading] = useState(false)
  const showUploadHint = avatarUrl.includes('placeholder')
  const [athleteSeason, setAthleteSeason] = useState('')
  const [athleteGrade, setAthleteGrade] = useState('')
  const [athleteBirthdate, setAthleteBirthdate] = useState('')
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

  useEffect(() => {
    let mounted = true
    const loadProfile = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return
      if (mounted) {
        setCurrentUserId(data.user.id)
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'full_name, avatar_url, athlete_season, athlete_grade_level, athlete_birthdate, bio, guardian_name, guardian_email, guardian_phone, account_owner_type, notification_prefs, athlete_privacy_settings, athlete_communication_settings, integration_settings',
        )
        .eq('id', data.user.id)
        .maybeSingle()
      const profileRow = (profile || null) as {
        full_name?: string | null
        avatar_url?: string | null
        athlete_season?: string | null
        athlete_grade_level?: string | null
        athlete_birthdate?: string | null
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
    window.addEventListener('ch:avatar-updated', onAvatarUpdated)
    window.addEventListener('ch:name-updated', onNameUpdated)
    return () => {
      window.removeEventListener('ch:avatar-updated', onAvatarUpdated)
      window.removeEventListener('ch:name-updated', onNameUpdated)
      mounted = false
    }
  }, [supabase])

  const handleAvatarChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch('/api/storage/avatar', {
      method: 'POST',
      body: formData,
    })
    if (response.ok) {
      const data = await response.json()
      setAvatarUrl(data.url)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ch_avatar_url', data.url)
        window.dispatchEvent(new CustomEvent('ch:avatar-updated', { detail: { url: data.url } }))
      }
    }
    setUploading(false)
    event.target.value = ''
  }, [])

  const enabledNotificationCategories = Object.entries(notificationPrefs)
    .filter(([, value]) => Boolean(value?.email || value?.push))
    .map(([key]) => key.replace(/_/g, ' '))

  const blockedCoachCount = privacySettings.blockedCoaches
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean).length

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <label
              className="relative block h-16 w-16 cursor-pointer rounded-full border-2 border-[#191919] bg-[#e8e8e8] bg-cover bg-center"
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
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Athlete Profile</p>
              <h1 className="display text-3xl font-semibold text-[#191919]">{displayName}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {athleteSeason && (
                  <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                    Season: {athleteSeason}
                  </span>
                )}
                {athleteGrade && (
                  <span className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919]">
                    Grade: {athleteGrade}
                  </span>
                )}
                {uploading && (
                  <span className="rounded-full border border-[#dcdcdc] px-3 py-1 text-xs text-[#4a4a4a]">
                    Uploading...
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <Link
              href="/athlete/settings#export-center"
              className="self-start rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
            >
              Go to export center
            </Link>
            <div className="flex flex-wrap gap-2">
              <Link href="/athlete/messages" className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors">
                Message coach
              </Link>
              <Link href="/athlete/calendar" className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white hover:opacity-90 transition-opacity">
                Book session
              </Link>
            </div>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">
            <section className="glass-card border border-[#191919] bg-white p-5">
              <h2 className="text-xl font-semibold text-[#191919]">About</h2>
              {bio ? (
                <p className="mt-3 text-sm text-[#4a4a4a]">{bio}</p>
              ) : (
                <p className="mt-3 text-sm text-[#4a4a4a]">
                  No bio yet.{' '}
                  <Link href="/athlete/settings" className="font-semibold underline text-[#191919]">
                    Add one in settings →
                  </Link>
                </p>
              )}
              <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Team</p>
                  <p className="mt-1 font-semibold text-[#191919]">{teamName || 'Not set'}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Primary coach</p>
                  <p className="mt-1 font-semibold text-[#191919]">{primaryCoachName || 'Not assigned'}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-sm">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Account owner</p>
                  <p className="mt-1 font-semibold text-[#191919]">{formatAccountOwnerLabel(accountOwnerType)}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Season</p>
                  <p className="mt-1 font-semibold text-[#191919]">{athleteSeason || 'Not set'}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Grade level</p>
                  <p className="mt-1 font-semibold text-[#191919]">{athleteGrade || 'Not set'}</p>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Date of birth</p>
                  <p className="mt-1 font-semibold text-[#191919]">
                    {athleteBirthdate
                      ? new Date(`${athleteBirthdate}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                      : 'Not set'}
                  </p>
                </div>
              </div>
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

            <section className="glass-card border border-[#191919] bg-white p-5">
              <h2 className="text-xl font-semibold text-[#191919]">Preferences & connections</h2>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Privacy</p>
                  <div className="mt-2 space-y-1 text-[#191919]">
                    <p>Direct messages: {privacySettings.allowDirectMessages ? 'Allowed' : 'Off'}</p>
                    <p>Blocked coaches: {blockedCoachCount}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Communication</p>
                  <div className="mt-2 space-y-1 text-[#191919]">
                    <p>Email updates: {communicationSettings.email ? 'On' : 'Off'}</p>
                    <p>Push updates: {communicationSettings.push ? 'On' : 'Off'}</p>
                    <p>Notifications: {enabledNotificationCategories.length ? enabledNotificationCategories.join(', ') : 'None enabled'}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Integrations</p>
                  <div className="mt-2 space-y-1 text-[#191919]">
                    <p>Calendar provider: {integrationSettings.calendarProvider}</p>
                    <p>Video provider: {integrationSettings.videoProvider}</p>
                    <p>Google: {integrationSettings.connections.google.connected ? 'Connected' : 'Not connected'}</p>
                    <p>Zoom: {integrationSettings.connections.zoom.connected ? 'Connected' : 'Not connected'}</p>
                    {integrationSettings.customVideoLink ? <p>Custom link: Configured</p> : null}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#4a4a4a]">Sync status</p>
                  <div className="mt-2 space-y-1 text-[#191919]">
                    <p>Name: {displayName || 'Not set'}</p>
                    <p>Season: {athleteSeason || 'Not set'}</p>
                    <p>Grade: {athleteGrade || 'Not set'}</p>
                    <p>Birthdate: {athleteBirthdate ? 'Saved' : 'Not set'}</p>
                    <p>Guardian info: {guardianName || guardianEmail || guardianPhone ? 'Saved' : 'Not set'}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="glass-card border border-[#191919] bg-white p-5">
              <h2 className="text-xl font-semibold text-[#191919]">Current programs</h2>
              <div className="mt-3 space-y-3 text-sm">
                <div className="rounded-2xl border border-dashed border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-[#4a4a4a]">
                  No active programs yet.
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
