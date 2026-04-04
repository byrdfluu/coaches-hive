'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import EmptyState from '@/components/EmptyState'
import AthleteSidebar from '@/components/AthleteSidebar'
import Toast from '@/components/Toast'
import { launchSurface } from '@/lib/launchSurface'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAthleteProfile } from '@/components/AthleteProfileContext'

type CoachCard = {
  name: string
  focus: string
  tag: string
  slug: string
  logoUrl?: string | null
  accent?: string | null
}

type CoachListCard = {
  id: string
  name: string
  tagline: string
  price: string
  rating: string
  specialty: string
  slug: string
  sport: string
  availability: string[]
  mode: string
  priceBucket: string
  location: string
  distance: number
  nextSlots: string[]
  nextSlotMinutes: number
  sessionTypes: string[]
  logoUrl?: string | null
  accent?: string | null
}

type TopCoachCard = {
  name: string
  specialty: string
  rating: string
  sessions: string
  response: string
  slug: string
  sport: string
}

type OrgCard = {
  name: string
  type: string
  location: string
  focus: string
  teams: string
  slug: string
  status: string
}

type TeamCard = {
  name: string
  orgName: string
  orgSlug: string
  sport: string
  level: string
  season: string
  status: string
}

type RecentCoachInvite = {
  id: string
  email: string | null
  status: string
  invite_delivery: string
  created_at: string | null
}

const workedWith: CoachCard[] = []
const orgCards: OrgCard[] = []
const teamCards: TeamCard[] = []

const priceOptions = [
  { label: 'All', value: 'All' },
  { label: 'Low', value: 'low' },
  { label: 'Mid', value: 'mid' },
  { label: 'High', value: 'high' },
]
const sessionTypeOptions = ['All', '1:1', 'Group', 'Virtual', 'Assessment']
const modeOptions = ['All', 'In-person', 'Remote', 'Hybrid']
const availabilityOptions = ['Today', 'Weekend', 'Evenings', 'Mornings']

const normalizeSignal = (value: string) => value.trim().replace(/\s+/g, ' ')

const uniqueSignals = (signals: string[]) => {
  const cleaned = signals.map(normalizeSignal).filter(Boolean)
  return Array.from(new Set(cleaned))
}

const normalizeCoachSignal = (value: string) =>
  value
    .replace(/&/g, 'and')
    .replace(/[,/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const buildFilterSignals = ({
  search,
  modeFilter,
  priceFilter,
  availabilityFilter,
  locationFilter,
  sessionTypeFilter,
}: {
  search: string
  modeFilter: string
  priceFilter: string
  availabilityFilter: string
  locationFilter: string
  sessionTypeFilter: string
}) => {
  const signals: string[] = []
  const trimmedSearch = search.trim()
  if (trimmedSearch) {
    signals.push(trimmedSearch)
  }
  if (modeFilter !== 'All') {
    signals.push(modeFilter)
  }
  if (priceFilter !== 'All') {
    signals.push(`${priceFilter} price`)
  }
  if (availabilityFilter !== 'All') {
    signals.push(availabilityFilter)
  }
  if (sessionTypeFilter !== 'All') {
    signals.push(`${sessionTypeFilter} sessions`)
  }
  if (locationFilter.trim()) {
    signals.push(`Near ${locationFilter.trim()}`)
  }
  return uniqueSignals(signals)
}

const buildCoachSignals = (value: string | null | undefined, fallback?: string) => {
  const signals: string[] = []
  if (value) {
    const normalized = normalizeCoachSignal(value)
    if (normalized) signals.push(normalized)
  }
  if (fallback) {
    signals.push(fallback)
  }
  return uniqueSignals(signals)
}

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const fallbackTrustScore = (stats?: { avg: number; count: number; verifiedCount: number } | null) => {
  if (!stats) return null
  const ratingScore = (stats.avg / 5) * 70
  const volumeScore = Math.min(stats.count, 20) * 1.5
  const verifiedScore = Math.min(stats.verifiedCount, 10) * 2
  return Math.min(100, Math.round(ratingScore + volumeScore + verifiedScore))
}

export default function AthleteDiscoverPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const orgDiscoveryEnabled = launchSurface.publicOrgEntryPointsEnabled
  const { activeSubProfile } = useAthleteProfile()
  const [workedWithCoaches, setWorkedWithCoaches] = useState(workedWith)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'Coaches' | 'Sessions' | 'Orgs/Teams'>('Coaches')
  const [modeFilter, setModeFilter] = useState('All')
  const [priceFilter, setPriceFilter] = useState('All')
  const [availabilityFilter, setAvailabilityFilter] = useState('All')
  const [sessionTypeFilter, setSessionTypeFilter] = useState('All')
  const [locationFilter, setLocationFilter] = useState('')
  const [sortBy, setSortBy] = useState('Recommended')
  const [searchFocused, setSearchFocused] = useState(false)
  const [visibleSessionCount, setVisibleSessionCount] = useState(6)
  const [visibleOrgCount, setVisibleOrgCount] = useState(6)
  const [visibleTeamCount, setVisibleTeamCount] = useState(6)
  const [brandMap, setBrandMap] = useState<Record<string, { id?: string; logoUrl?: string | null; accent?: string | null }>>({})
  const [reviewStats, setReviewStats] = useState<Record<string, { avg: number; count: number; verifiedCount: number }>>({})
  const [trustMetrics, setTrustMetrics] = useState<Record<string, { trustScore: number; completionRate: number | null; cancellationRate: number | null; responseHours: number | null }>>({})
  const [orgSearch, setOrgSearch] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [orgTypeFilter, setOrgTypeFilter] = useState('All')
  const [teamSportFilter, setTeamSportFilter] = useState('All')
  const [orgList, setOrgList] = useState<OrgCard[]>(orgCards)
  const [teamList, setTeamList] = useState<TeamCard[]>(teamCards)
  const [coachList, setCoachList] = useState<CoachListCard[]>([])
  const [savedCoachIds, setSavedCoachIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')
  const [inviteSending, setInviteSending] = useState(false)
  const [recentCoachInvites, setRecentCoachInvites] = useState<RecentCoachInvite[]>([])
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const lastSignalKey = useRef('')
  const skipSignalLog = useRef(true)

  // Pre-populate search with active sub-profile sport if no search is set
  useEffect(() => {
    const sport = activeSubProfile?.sport
    if (sport && !search) setSearch(sport)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubProfile?.sport])

  const activeFilterCount = [
    sessionTypeFilter !== 'All',
    priceFilter !== 'All',
    modeFilter !== 'All',
    availabilityFilter !== 'All',
    sortBy !== 'Recommended',
  ].filter(Boolean).length

  const clearAllFilters = () => {
    setSearch('')
    setModeFilter('All')
    setPriceFilter('All')
    setAvailabilityFilter('All')
    setSessionTypeFilter('All')
    setLocationFilter('')
    setSortBy('Recommended')
  }

  const queueDemandSignals = useCallback((payload: { event_type: string; signals: string[]; metadata?: Record<string, unknown> }) => {
    if (!payload.signals.length) return
    fetch('/api/demand-signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {})
  }, [])

  const currentFilterSignals = buildFilterSignals({
    search,
    modeFilter,
    priceFilter,
    availabilityFilter,
    locationFilter,
    sessionTypeFilter,
  })

  const logFilterSignals = useCallback((eventType: string, metadata?: Record<string, unknown>) => {
    if (!currentFilterSignals.length) return
    queueDemandSignals({
      event_type: eventType,
      signals: currentFilterSignals,
      metadata: {
        source: 'athlete_discover',
        search: search.trim() || null,
        filters: {
          mode: modeFilter,
          price: priceFilter,
          availability: availabilityFilter,
          sessionType: sessionTypeFilter,
          location: locationFilter || null,
          sort: sortBy,
        },
        ...metadata,
      },
    })
  }, [
    availabilityFilter,
    currentFilterSignals,
    locationFilter,
    modeFilter,
    priceFilter,
    queueDemandSignals,
    search,
    sessionTypeFilter,
    sortBy,
  ])

  const logProfileSignals = ({
    coachId,
    coachSlug,
    coachName,
    signals,
  }: {
    coachId?: string | null
    coachSlug?: string | null
    coachName?: string | null
    signals: string[]
  }) => {
    const unique = uniqueSignals(signals)
    if (!unique.length) return
    queueDemandSignals({
      event_type: 'profile_view',
      signals: unique,
      metadata: {
        source: 'athlete_discover',
        coach_id: coachId || null,
        coach_slug: coachSlug || null,
        coach_name: coachName || null,
      },
    })
  }

  const logBookingIntent = ({
    coachId,
    coachSlug,
    coachName,
    signals,
  }: {
    coachId?: string | null
    coachSlug?: string | null
    coachName?: string | null
    signals: string[]
  }) => {
    const combined = uniqueSignals([...currentFilterSignals, ...signals])
    if (!combined.length) return
    queueDemandSignals({
      event_type: 'booking_intent',
      signals: combined,
      metadata: {
        source: 'athlete_discover',
        coach_id: coachId || null,
        coach_slug: coachSlug || null,
        coach_name: coachName || null,
      },
    })
  }

  const loadRecentCoachInvites = useCallback(async () => {
    const response = await fetch('/api/invites/coach', { cache: 'no-store' })
    if (!response.ok) return

    const payload = await response.json().catch(() => null)
    setRecentCoachInvites(Array.isArray(payload?.invites) ? payload.invites : [])
  }, [])

  const loadSavedCoaches = useCallback(async () => {
    const response = await fetch('/api/athlete/saved-coaches', { cache: 'no-store' })
    if (!response.ok) return

    const payload = await response.json().catch(() => null)
    setSavedCoachIds(new Set(payload?.saved_coach_ids || []))
  }, [])

  useEffect(() => {
    const inviteParam = searchParams?.get('invite')
    if (inviteParam === 'coach') {
      setShowInviteModal(true)
      void loadRecentCoachInvites()
    }
  }, [loadRecentCoachInvites, searchParams])

  const openInviteModal = () => {
    setInviteNotice('')
    setShowInviteModal(true)
    void loadRecentCoachInvites()
    if (searchParams?.get('invite') !== 'coach') {
      router.push('/athlete/discover?invite=coach')
    }
  }

  const closeInviteModal = () => {
    setShowInviteModal(false)
    setInviteNotice('')
    setInviteEmail('')
    if (searchParams?.get('invite') === 'coach') {
      router.push('/athlete/discover')
    }
  }

  const handleInviteCoach = async (event?: FormEvent) => {
    event?.preventDefault()
    if (inviteSending) return
    const trimmedEmail = inviteEmail.trim()
    if (!trimmedEmail) {
      setInviteNotice('Enter the coach\'s email address to send an invite.')
      return
    }

    setInviteSending(true)
    setInviteNotice('')
    try {
      const response = await fetch('/api/invites/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to send invite.')
      }
      setInviteNotice('')
      setToast('Invite sent! We will reach out to them via email.')
      setInviteEmail('')
      await loadRecentCoachInvites()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send invite.'
      setInviteNotice(message)
      setToast(message)
    } finally {
      setInviteSending(false)
    }
  }

  useEffect(() => {
    let active = true
    const loadWorkedWith = async () => {
      const response = await fetch('/api/memberships')
      if (!response.ok) return
      const payload = await response.json()
      const links: Array<{
        coach_id?: string
        coach_profile?: { id: string; full_name: string | null; avatar_url?: string | null; brand_logo_url?: string | null; brand_accent_color?: string | null } | null
      }> = Array.isArray(payload.links) ? payload.links : []
      const seenIds = new Set<string>()
      const cards = links
        .filter((link) => link.coach_id && !seenIds.has(link.coach_id) && seenIds.add(link.coach_id as string))
        .map((link) => {
          const profile = link.coach_profile
          const name = profile?.full_name || 'Coach'
          return {
            name,
            focus: 'Existing coach connection',
            tag: 'Connected',
            slug: slugify(name),
            logoUrl: profile?.brand_logo_url || profile?.avatar_url,
            accent: profile?.brand_accent_color || null,
          }
        })
      if (!active) return
      setWorkedWithCoaches(cards)
    }
    loadWorkedWith()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      const response = await fetch('/api/athlete/saved-coaches', { cache: 'no-store' })
      if (!response.ok || !active) return
      const payload = await response.json().catch(() => null)
      if (!active) return
      setSavedCoachIds(new Set(payload?.saved_coach_ids || []))
    }
    load()
    return () => { active = false }
  }, [])

  const toggleSaveCoach = async (coachId: string) => {
    const wasSaved = savedCoachIds.has(coachId)
    setSavedCoachIds((prev) => {
      const next = new Set(prev)
      if (wasSaved) next.delete(coachId)
      else next.add(coachId)
      return next
    })
    const response = await fetch('/api/athlete/saved-coaches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coach_id: coachId }),
    })
    if (!response.ok) {
      // Revert on failure
      setSavedCoachIds((prev) => {
        const next = new Set(prev)
        if (wasSaved) next.add(coachId)
        else next.delete(coachId)
        return next
      })
      setToast('Unable to update saved coaches. Try again.')
    } else {
      const data = await response.json().catch(() => null)
      if (Array.isArray(data?.saved_coach_ids)) {
        setSavedCoachIds(new Set(data.saved_coach_ids))
      } else {
        await loadSavedCoaches()
      }
      setToast(data?.saved ? 'Coach saved.' : 'Coach removed from saved.')
    }
  }

  useEffect(() => {
    let active = true
    const loadBranding = async () => {
      const response = await fetch('/api/public/coaches')
      if (!response.ok) return
      const payload = await response.json().catch(() => null)
      if (!active) return
      const coachProfiles = ((payload?.coaches || []) as Array<{
        id: string
        full_name: string | null
        bio?: string | null
        brand_logo_url?: string | null
        brand_accent_color?: string | null
        avatar_url?: string | null
        coach_profile_settings?: unknown
        mode?: string
        sessionTypes?: string[]
        availability?: string[]
        nextSlotMinutes?: number
      }>)
      const map: Record<string, { id?: string; logoUrl?: string | null; accent?: string | null }> = {}
      const cards: CoachListCard[] = []
      coachProfiles.forEach((profile) => {
        if (!profile.full_name) return
        const slug = slugify(profile.full_name)
        map[profile.id] = {
          id: profile.id,
          logoUrl: profile.brand_logo_url || profile.avatar_url,
          accent: profile.brand_accent_color || null,
        }
        const settings = profile.coach_profile_settings && typeof profile.coach_profile_settings === 'object'
          ? profile.coach_profile_settings as { title?: string; location?: string; primarySport?: string; rates?: { oneOnOne?: string } }
          : {}
        const rawRate = settings.rates?.oneOnOne || ''
        const rateNum = parseFloat(rawRate.replace(/[^0-9.]/g, '')) || 0
        const price = rateNum > 0 ? `$${rateNum}/hr` : 'Contact for pricing'
        const priceBucket = rateNum === 0 ? '' : rateNum < 75 ? 'low' : rateNum <= 150 ? 'mid' : 'high'
        cards.push({
          id: profile.id,
          name: profile.full_name,
          tagline: profile.bio || settings.title || '',
          price,
          rating: '—',
          specialty: settings.primarySport || '',
          slug,
          sport: settings.primarySport || '',
          availability: Array.isArray(profile.availability) ? profile.availability as string[] : [],
          mode: typeof profile.mode === 'string' ? profile.mode : '',
          priceBucket,
          location: settings.location || '',
          distance: 0,
          nextSlots: [],
          nextSlotMinutes: typeof profile.nextSlotMinutes === 'number' ? profile.nextSlotMinutes : 999,
          sessionTypes: Array.isArray(profile.sessionTypes) ? profile.sessionTypes as string[] : [],
          logoUrl: profile.brand_logo_url || profile.avatar_url,
          accent: profile.brand_accent_color || null,
        })
      })
      setBrandMap(map)
      setCoachList(cards)
    }
    loadBranding()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    let active = true
    const loadReviews = async () => {
      const { data } = await supabase
        .from('coach_reviews')
        .select('coach_id, rating, status, verified')
        .eq('status', 'approved')
      if (!active) return
      const reviewRows = (data || []) as Array<{
        coach_id?: string | null
        rating?: number | null
        verified?: boolean | null
      }>
      const map: Record<string, { total: number; count: number; verifiedCount: number }> = {}
      reviewRows.forEach((row) => {
        if (!row.coach_id) return
        const entry = map[row.coach_id] || { total: 0, count: 0, verifiedCount: 0 }
        entry.total += row.rating || 0
        entry.count += 1
        if (row.verified) entry.verifiedCount += 1
        map[row.coach_id] = entry
      })
      const next: Record<string, { avg: number; count: number; verifiedCount: number }> = {}
      Object.entries(map).forEach(([coachId, entry]) => {
        next[coachId] = {
          avg: entry.count ? Math.round((entry.total / entry.count) * 10) / 10 : 0,
          count: entry.count,
          verifiedCount: entry.verifiedCount,
        }
      })
      setReviewStats(next)
    }
    loadReviews()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    let active = true
    const loadTrust = async () => {
      const coachIds = Array.from(new Set(Object.values(brandMap).map((entry) => entry.id).filter(Boolean))) as string[]
      if (coachIds.length === 0) {
        if (active) setTrustMetrics({})
        return
      }
      const response = await fetch(`/api/coach/trust?coach_ids=${coachIds.join(',')}`)
      if (!response.ok) return
      const payload = await response.json()
      if (!active) return
      setTrustMetrics(payload.trust || {})
    }
    loadTrust()
    return () => {
      active = false
    }
  }, [brandMap])

  useEffect(() => {
    let active = true
    const loadOrganizations = async () => {
      if (!orgDiscoveryEnabled) return
      const response = await fetch('/api/public/orgs')
      if (!response.ok) return
      const payload = await response.json().catch(() => null)
      if (!active) return
      const organizations = ((payload?.organizations || []) as Array<{
        id: string
        name?: string | null
        org_type?: string | null
      }>)
      if (organizations.length === 0) return

      const orgSettingsRows = ((payload?.settings || []) as Array<{ org_id: string; location?: string | null }>)
      const locationMap = new Map(
        orgSettingsRows.map((row) => [row.org_id, row.location] as const),
      )
      const orgMap = new Map(organizations.map((row) => [row.id, row.name] as const))

      const formattedOrgs: OrgCard[] = organizations.map((org) => ({
        name: org.name || 'Organization',
        type: org.org_type || 'Program',
        location: locationMap.get(org.id) || 'Multiple locations',
        focus: 'Multi-sport program',
        teams: 'Teams available',
        slug: slugify(org.name || ''),
        status: 'Registration open',
      }))

      setOrgList(formattedOrgs)

      const teams = ((payload?.teams || []) as Array<{ id: string; name?: string | null; org_id?: string | null }>)
      if (teams.length > 0) {
        const formattedTeams: TeamCard[] = teams.map((team) => {
          const orgName = team.org_id ? orgMap.get(team.org_id) : 'Organization'
          return {
            name: team.name || 'Team',
            orgName: orgName || 'Organization',
            orgSlug: slugify(orgName || ''),
            sport: 'Multi-sport',
            level: 'Program',
            season: 'Seasonal',
            status: 'Open',
          }
        })
        setTeamList(formattedTeams)
      }
    }
    loadOrganizations()
    return () => {
      active = false
    }
  }, [orgDiscoveryEnabled])

  const filteredCoaches = useMemo(() => {
    const query = search.trim().toLowerCase()
    const locationQuery = locationFilter.trim().toLowerCase()
    const filtered = coachList.filter((coach) => {
      const matchesSearch =
        !query ||
        coach.name.toLowerCase().includes(query) ||
        coach.tagline.toLowerCase().includes(query) ||
        coach.specialty.toLowerCase().includes(query)
      const matchesMode = modeFilter === 'All' || coach.mode === modeFilter
      const matchesPrice = priceFilter === 'All' || coach.priceBucket === priceFilter
      const matchesAvailability = availabilityFilter === 'All' || coach.availability.includes(availabilityFilter)
      const matchesSessionType =
        sessionTypeFilter === 'All' || coach.sessionTypes.includes(sessionTypeFilter)
      const matchesLocation = !locationQuery || coach.location.toLowerCase().includes(locationQuery)
      return (
        matchesSearch &&
        matchesMode &&
        matchesPrice &&
        matchesAvailability &&
        matchesSessionType &&
        matchesLocation
      )
    })
    const trustForCoach = (coachId: string) => {
      const trust = coachId ? trustMetrics[coachId]?.trustScore : null
      if (trust !== undefined && trust !== null) return trust
      return fallbackTrustScore(coachId ? reviewStats[coachId] : null) ?? 0
    }
    const priceValue = (price: string) => Number(price.replace(/[^0-9.]/g, '')) || 0
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'Cheapest') return priceValue(a.price) - priceValue(b.price)
      if (sortBy === 'Soonest') return a.nextSlotMinutes - b.nextSlotMinutes
      return trustForCoach(b.id) - trustForCoach(a.id)
    })
    return sorted
  }, [
    search,
    modeFilter,
    priceFilter,
    availabilityFilter,
    sessionTypeFilter,
    locationFilter,
    sortBy,
    coachList,
    reviewStats,
    trustMetrics,
  ])

  const coachNameSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (query.length < 1) return []
    return coachList
      .filter((coach) => coach.name.toLowerCase().includes(query))
      .slice(0, 6)
  }, [coachList, search])

  const topCoaches = useMemo<TopCoachCard[]>(() => {
    return coachList
      .filter((c) => {
        const stats = reviewStats[c.id]
        return stats && stats.count > 0
      })
      .sort((a, b) => {
        return (reviewStats[b.id]?.avg ?? 0) - (reviewStats[a.id]?.avg ?? 0)
      })
      .slice(0, 3)
      .map((c) => {
        const stats = reviewStats[c.id]
        const trust = trustMetrics[c.id]
        return {
          name: c.name,
          specialty: c.specialty,
          rating: stats?.avg ? stats.avg.toFixed(1) : '—',
          sessions: stats?.count ? `${stats.count} session${stats.count === 1 ? '' : 's'}` : '',
          response: trust?.responseHours ? `Responds in ~${trust.responseHours}h` : '',
          slug: c.slug,
          sport: c.sport,
        }
      })
  }, [coachList, reviewStats, trustMetrics])

  const filteredOrgs = useMemo(() => {
    const query = orgSearch.trim().toLowerCase()
    return orgList.filter((org) => {
      const matchesSearch =
        !query ||
        org.name.toLowerCase().includes(query) ||
        org.location.toLowerCase().includes(query) ||
        org.focus.toLowerCase().includes(query)
      const matchesType = orgTypeFilter === 'All' || org.type === orgTypeFilter
      return matchesSearch && matchesType
    })
  }, [orgList, orgSearch, orgTypeFilter])

  const filteredTeams = useMemo(() => {
    const query = teamSearch.trim().toLowerCase()
    return teamList.filter((team) => {
      const matchesSearch =
        !query ||
        team.name.toLowerCase().includes(query) ||
        team.orgName.toLowerCase().includes(query)
      const matchesSport = teamSportFilter === 'All' || team.sport === teamSportFilter
      return matchesSearch && matchesSport
    })
  }, [teamList, teamSearch, teamSportFilter])

  const visibleCoaches = filteredCoaches

  const availableSessions = useMemo(() => {
    const sessions = filteredCoaches.flatMap((coach) =>
      coach.nextSlots.map((slot, index) => ({
        coach,
        slot,
        sortKey: coach.nextSlotMinutes + index * 90,
      }))
    )
    return sessions.sort((a, b) => a.sortKey - b.sortKey)
  }, [filteredCoaches])

  const visibleSessions = useMemo(
    () => availableSessions.slice(0, visibleSessionCount),
    [availableSessions, visibleSessionCount]
  )
  const sessionDiscoveryEnabled = availableSessions.length > 0

  useEffect(() => {
    if (activeTab === 'Sessions' && !sessionDiscoveryEnabled) {
      setActiveTab('Coaches')
      return
    }
    if (activeTab === 'Orgs/Teams' && !orgDiscoveryEnabled) {
      setActiveTab('Coaches')
    }
  }, [activeTab, orgDiscoveryEnabled, sessionDiscoveryEnabled])

  const visibleOrgs = useMemo(() => filteredOrgs.slice(0, visibleOrgCount), [filteredOrgs, visibleOrgCount])
  const visibleTeams = useMemo(() => filteredTeams.slice(0, visibleTeamCount), [filteredTeams, visibleTeamCount])

  useEffect(() => {
    const nextKey = [
      search.trim().toLowerCase(),
      modeFilter,
      priceFilter,
      availabilityFilter,
      sessionTypeFilter,
      locationFilter.trim().toLowerCase(),
      sortBy,
    ].join('|')

    if (skipSignalLog.current) {
      skipSignalLog.current = false
      lastSignalKey.current = nextKey
      return
    }

    const timer = setTimeout(() => {
      if (nextKey === lastSignalKey.current) return
      lastSignalKey.current = nextKey
      logFilterSignals('search_filters')
    }, 800)

    return () => clearTimeout(timer)
  }, [search, modeFilter, priceFilter, availabilityFilter, sessionTypeFilter, locationFilter, sortBy, logFilterSignals])

  useEffect(() => {
    setVisibleSessionCount(6)
    setVisibleOrgCount(6)
    setVisibleTeamCount(6)
  }, [search, modeFilter, priceFilter, availabilityFilter, sessionTypeFilter, locationFilter, sortBy])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Discover</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">
              {orgDiscoveryEnabled ? 'Find coaches, book sessions, or join a team.' : 'Find the right coach and start booking.'}
            </h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              {orgDiscoveryEnabled
                ? 'Switch tabs to focus on coaches, sessions, or organizations.'
                : 'Compare verified coaches, save favorites, and jump into booking from one place.'}
            </p>
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="space-y-6">
            <section className="glass-card sticky top-4 z-20 border border-[#191919] bg-white p-4 text-sm">
              {/* Tabs + quick actions */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {([
                    'Coaches',
                    ...(sessionDiscoveryEnabled ? (['Sessions'] as const) : []),
                    ...(orgDiscoveryEnabled ? (['Orgs/Teams'] as const) : []),
                  ] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                        activeTab === tab
                          ? 'border-[#191919] bg-[#f5f5f5] text-[#191919]'
                          : 'border-[#dcdcdc] bg-white text-[#191919] hover:border-[#191919] hover:bg-[#f5f5f5]'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {sessionDiscoveryEnabled ? (
                    <button
                      type="button"
                      onClick={() => { setActiveTab('Sessions'); setAvailabilityFilter('Today'); setSortBy('Soonest') }}
                      className="rounded-full border border-[#dcdcdc] px-3 py-1 text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919] transition-colors"
                    >
                      Book next session
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setActiveTab('Coaches')}
                    className="rounded-full border border-[#dcdcdc] px-3 py-1 text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919] transition-colors"
                  >
                    Browse coaches
                  </button>
                  <button
                    type="button"
                    onClick={openInviteModal}
                    className="rounded-full border border-[#dcdcdc] px-3 py-1 text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919] transition-colors"
                  >
                    Invite coach
                  </button>
                </div>
              </div>

              <div className="my-3 border-t border-[#f0f0f0]" />

              {/* Search row */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                    placeholder="Search coach name, sport, or specialty"
                    className="w-full rounded-full border border-[#191919] px-4 py-2 text-sm text-[#191919] outline-none"
                  />
                  {searchFocused && coachNameSuggestions.length > 0 ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-[#191919] bg-white shadow-lg">
                      {coachNameSuggestions.map((coach) => (
                        <button
                          key={coach.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setSearch(coach.name)
                            setSearchFocused(false)
                          }}
                          className="flex w-full items-center justify-between gap-3 border-b border-[#ececec] px-4 py-3 text-left text-sm text-[#191919] transition-colors hover:bg-[#f7f6f4] last:border-b-0"
                        >
                          <span>
                            <span className="block font-semibold">{coach.name}</span>
                            <span className="block text-xs text-[#4a4a4a]">
                              {[coach.specialty, coach.location].filter(Boolean).join(' · ') || coach.tagline || 'Coach'}
                            </span>
                          </span>
                          <span className="text-[11px] font-semibold text-[#4a4a4a]">Select</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <input
                  type="text"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  placeholder="City"
                  className="w-[130px] rounded-full border border-[#dcdcdc] px-3 py-2 text-sm text-[#191919] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowMoreFilters((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    activeFilterCount > 0
                      ? 'border-[#191919] bg-[#191919] text-white'
                      : 'border-[#dcdcdc] text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919]'
                  }`}
                >
                  Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showMoreFilters ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="rounded-full border border-[#dcdcdc] px-3 py-2 text-xs text-[#9a9a9a] hover:border-[#191919] hover:text-[#191919] transition-colors"
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => logFilterSignals('search_filters', { trigger: 'button' })}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  Search
                </button>
              </div>

              {/* Expandable advanced filters */}
              {showMoreFilters && (
                <div className="mt-3 space-y-2.5 rounded-2xl border border-[#ececec] bg-[#fafafa] p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-24 flex-shrink-0 text-[11px] font-semibold text-[#4a4a4a]">Format</span>
                    {modeOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setModeFilter(option)}
                        className={`rounded-full border px-3 py-1 font-semibold transition ${
                          modeFilter === option
                            ? 'border-[#191919] bg-white text-[#191919]'
                            : 'border-[#dcdcdc] bg-white text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919]'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-24 flex-shrink-0 text-[11px] font-semibold text-[#4a4a4a]">Session type</span>
                    {sessionTypeOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setSessionTypeFilter(option)}
                        className={`rounded-full border px-3 py-1 font-semibold transition ${
                          sessionTypeFilter === option
                            ? 'border-[#191919] bg-white text-[#191919]'
                            : 'border-[#dcdcdc] bg-white text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919]'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-24 flex-shrink-0 text-[11px] font-semibold text-[#4a4a4a]">Availability</span>
                    {['All', ...availabilityOptions].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setAvailabilityFilter(option)}
                        className={`rounded-full border px-3 py-1 font-semibold transition ${
                          availabilityFilter === option
                            ? 'border-[#191919] bg-white text-[#191919]'
                            : 'border-[#dcdcdc] bg-white text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919]'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-24 flex-shrink-0 text-[11px] font-semibold text-[#4a4a4a]">Price</span>
                    {priceOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPriceFilter(option.value)}
                        className={`rounded-full border px-3 py-1 font-semibold transition ${
                          priceFilter === option.value
                            ? 'border-[#191919] bg-white text-[#191919]'
                            : 'border-[#dcdcdc] bg-white text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-24 flex-shrink-0 text-[11px] font-semibold text-[#4a4a4a]">Sort by</span>
                    {(sessionDiscoveryEnabled ? ['Recommended', 'Soonest', 'Cheapest'] : ['Recommended', 'Cheapest']).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSortBy(s)}
                        className={`rounded-full border px-3 py-1 font-semibold transition ${
                          sortBy === s
                            ? 'border-[#191919] bg-white text-[#191919]'
                            : 'border-[#dcdcdc] bg-white text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
            {activeTab === 'Coaches' && (
              <>
                <section className="glass-card border border-[#191919] bg-white p-5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coach results</p>
                      <p className="text-lg font-semibold text-[#191919]">
                        {filteredCoaches.length} coaches matched
                      </p>
                    </div>
                    <p className="text-xs text-[#4a4a4a]">Scroll to see more coaches.</p>
                  </div>
                  <div className="mt-4 space-y-3 max-h-[700px] overflow-y-auto pr-2">
                    {filteredCoaches.length === 0 ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm text-[#4a4a4a]">
                        No coaches match these filters. Try a different name, specialty, price, or location.
                      </div>
                    ) : (
                      visibleCoaches.map((coach) => {
                        const branding = brandMap[coach.id] || {}
                        const coachId = coach.id
                        const review = reviewStats[coachId]
                        const ratingLabel = review?.count ? review.avg.toFixed(1) : coach.rating
                        const trustSummary = trustMetrics[coachId]
                        const trustScore = trustSummary?.trustScore ?? fallbackTrustScore(review || null)
                        const tags = [
                          coach.distance > 0 && coach.distance <= 8 ? 'Nearby' : null,
                          coach.availability.includes('Today') ? 'Available today' : null,
                        ].filter(Boolean) as string[]
                        return (
                          <div
                            key={coach.id}
                            className="glass-card border border-[#191919] bg-white p-4 text-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="flex items-start gap-4">
                                <div
                                  className="h-12 w-12 rounded-full border border-[#191919] bg-[#f5f5f5] bg-cover bg-center"
                                  style={{ backgroundImage: branding.logoUrl ? `url(${branding.logoUrl})` : 'none' }}
                                />
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-lg font-semibold text-[#191919]">{coach.name}</p>
                                    {review?.verifiedCount ? (
                                      <span className="rounded-full border border-[#b80f0a] bg-[#fff6f5] px-2 py-0.5 text-[10px] font-semibold text-[#b80f0a]">
                                        Verified
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="text-sm text-[#4a4a4a]">{coach.tagline}</p>
                                  <p className="text-xs text-[#4a4a4a]">{coach.specialty}</p>
                                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#4a4a4a]">
                                    {coach.location ? (
                                      <span className="rounded-full border border-[#191919] px-2 py-0.5">
                                        {coach.location}
                                      </span>
                                    ) : null}
                                    {coach.distance > 0 ? (
                                      <span className="rounded-full border border-[#191919] px-2 py-0.5">
                                        {coach.distance} mi
                                      </span>
                                    ) : null}
                                    {tags.map((tag) => (
                                      <span
                                        key={`${coach.slug}-${tag}`}
                                        className="rounded-full border border-[#191919] px-2 py-0.5"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2 text-xs text-[#4a4a4a]">
                                <span className="text-sm font-semibold text-[#191919]">{coach.price}</span>
                                <span>Rating {ratingLabel}</span>
                                {trustScore !== null ? <span>Trust score {trustScore}</span> : null}
                                {trustSummary?.responseHours !== null && trustSummary?.responseHours !== undefined ? (
                                  <span>Avg response {trustSummary.responseHours}h</span>
                                ) : null}
                              </div>
                            </div>
                            {coach.nextSlots.length > 0 ? (
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                <span className="text-[11px] font-semibold text-[#4a4a4a]">Next slots</span>
                                {coach.nextSlots.slice(0, 3).map((slot) => (
                                  <Link
                                    key={`${coach.slug}-${slot}`}
                                    href={`/athlete/calendar?coach=${coach.slug}`}
                                    className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                                    onClick={() =>
                                      logBookingIntent({
                                        coachId,
                                        coachSlug: coach.slug,
                                        coachName: coach.name,
                                        signals: buildCoachSignals(coach.specialty, coach.sport),
                                      })
                                    }
                                  >
                                    {slot}
                                  </Link>
                                ))}
                              </div>
                            ) : null}
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                              <Link
                                href={`/athlete/coaches/${coach.slug || slugify(coach.name)}`}
                                className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                                onClick={() =>
                                  logProfileSignals({
                                    coachId,
                                    coachSlug: coach.slug,
                                    coachName: coach.name,
                                    signals: buildCoachSignals(coach.specialty, coach.sport),
                                  })
                                }
                              >
                                View profile
                              </Link>
                              <Link
                                href={`/athlete/messages?new=${coach.slug}`}
                                className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                              >
                                Message
                              </Link>
                              <Link
                                href={`/athlete/calendar?coach=${coach.slug}`}
                                className="rounded-full border border-[var(--brand-accent)] bg-[var(--brand-accent)] px-3 py-1 font-semibold text-white transition-colors hover:bg-white hover:text-[var(--brand-accent)]"
                                style={{ '--brand-accent': coach.accent || branding.accent || '#b80f0a' } as CSSProperties}
                                onClick={() =>
                                  logBookingIntent({
                                    coachId,
                                    coachSlug: coach.slug,
                                    coachName: coach.name,
                                    signals: buildCoachSignals(coach.specialty, coach.sport),
                                  })
                                }
                              >
                                Book
                              </Link>
                              {coachId ? (
                                <button
                                  type="button"
                                  onClick={() => toggleSaveCoach(coachId)}
                                  className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#4a4a4a] hover:border-[#191919] hover:text-[#191919] transition-colors"
                                >
                                  {savedCoachIds.has(coachId) ? '♥ Saved' : '♡ Save'}
                                </button>
                              ) : null}
                              <span className="text-[11px] text-[#4a4a4a]">
                                Open calendar to pick a time and continue booking.
                              </span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </section>
                <section className="glass-card border border-[#191919] bg-white p-5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coaches you’ve worked with</p>
                      <p className="text-lg font-semibold text-[#191919]">Keep collaborating</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {workedWithCoaches.map((coach) => (
                      <div
                        key={coach.name}
                        className="glass-card space-y-2 rounded-2xl border border-[#191919] bg-white p-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-10 w-10 rounded-full border border-[#191919] bg-[#f5f5f5] bg-cover bg-center"
                              style={{ backgroundImage: coach.logoUrl ? `url(${coach.logoUrl})` : 'none' }}
                            />
                            <div>
                              <p className="text-sm font-semibold text-[#191919]">{coach.name}</p>
                              <p className="text-xs text-[#4a4a4a]">{coach.focus}</p>
                              <span className="mt-1 inline-flex rounded-full border border-[#191919] px-2 py-0.5 text-[11px] font-semibold text-[#191919]">
                                {coach.tag}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 text-xs text-[#191919]">
                            <Link
                              href={`/athlete/coaches/${coach.slug || slugify(coach.name)}`}
                              className="rounded-full border border-[#191919] bg-white px-3 py-1 font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                              onClick={() =>
                                logProfileSignals({
                                  coachSlug: coach.slug,
                                  coachName: coach.name,
                                  signals: buildCoachSignals(coach.focus, coach.tag),
                                })
                              }
                            >
                              View profile
                            </Link>
                            <Link
                              href={`/athlete/messages?thread=${coach.slug}`}
                              className="rounded-full border border-[#191919] bg-white px-3 py-1 font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                            >
                              Message
                            </Link>
                            <Link
                              href={`/athlete/calendar?coach=${coach.slug || slugify(coach.name)}`}
                              className="rounded-full border border-[var(--brand-accent)] bg-[var(--brand-accent)] px-3 py-1 font-semibold text-white transition-colors hover:bg-white hover:text-[var(--brand-accent)]"
                              style={{ '--brand-accent': coach.accent || '#b80f0a' } as CSSProperties}
                              onClick={() =>
                                logBookingIntent({
                                  coachSlug: coach.slug,
                                  coachName: coach.name,
                                  signals: buildCoachSignals(coach.focus, coach.tag),
                                })
                              }
                            >
                              Book
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="glass-card border border-[#191919] bg-white p-5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Saved coaches</p>
                      <p className="text-lg font-semibold text-[#191919]">Quick access favorites</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {savedCoachIds.size === 0 ? (
                      <div className="col-span-2 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-4 text-sm text-[#4a4a4a]">
                        No saved coaches yet. Click ♡ Save on a coach card to add them here.
                      </div>
                    ) : coachList
                        .filter((coach) => {
                          return savedCoachIds.has(coach.id)
                        })
                        .map((coach) => {
                          return (
                            <div
                              key={coach.id}
                              className="glass-card space-y-2 rounded-2xl border border-[#191919] bg-white p-4"
                            >
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="h-10 w-10 rounded-full border border-[#191919] bg-[#f5f5f5] bg-cover bg-center"
                                    style={{ backgroundImage: coach.logoUrl ? `url(${coach.logoUrl})` : 'none' }}
                                  />
                                  <div>
                                    <p className="text-sm font-semibold text-[#191919]">{coach.name}</p>
                                    <p className="text-xs text-[#4a4a4a]">{coach.specialty || coach.tagline}</p>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2 text-xs text-[#191919]">
                                  <Link
                                    href={`/athlete/coaches/${coach.slug}`}
                                    className="rounded-full border border-[#191919] bg-white px-3 py-1 font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                                  >
                                    View profile
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => toggleSaveCoach(coach.id)}
                                    className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#4a4a4a] hover:border-[#b80f0a] hover:text-[#b80f0a] transition-colors"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })
                    }
                  </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
                  <div className="glass-card border border-[#191919] bg-white p-5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Coaches</p>
                        <p className="text-lg font-semibold text-[#191919]">Top coaches this week</p>
                      </div>
                      <Link href="/athlete/calendar" className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]">
                        Book fast
                      </Link>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {topCoaches.map((coach) => {
                        const coachCard = coachList.find((entry) => entry.slug === coach.slug)
                        const review = coachCard ? reviewStats[coachCard.id] : null
                        const ratingLabel = review?.count ? review.avg.toFixed(1) : coach.rating
                        const trustSummary = coachCard ? trustMetrics[coachCard.id] : null
                        const trustScore = trustSummary?.trustScore ?? fallbackTrustScore(review || null)
                        return (
                          <div key={coach.name} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="h-10 w-10 rounded-full border border-[#191919] bg-[#f5f5f5] bg-cover bg-center"
                                style={{ backgroundImage: coachCard?.logoUrl ? `url(${coachCard.logoUrl})` : 'none' }}
                              />
                              <div>
                                <p className="font-semibold text-[#191919]">{coach.name}</p>
                                <p className="text-xs text-[#4a4a4a]">{coach.specialty}</p>
                              </div>
                            </div>
                            <div className="mt-3 space-y-1 text-xs text-[#4a4a4a]">
                              <p>Rating {ratingLabel}</p>
                              {trustScore !== null ? <p>Trust score {trustScore}</p> : null}
                              {trustSummary?.completionRate !== null && trustSummary?.completionRate !== undefined ? (
                                <p>Completion {(trustSummary.completionRate * 100).toFixed(0)}%</p>
                              ) : null}
                              {trustSummary?.responseHours !== null && trustSummary?.responseHours !== undefined ? (
                                <p>Avg response {trustSummary.responseHours}h</p>
                              ) : null}
                              <p>{coach.sessions}</p>
                              <p>{coach.response}</p>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <Link
                                href={`/athlete/coaches/${coach.slug}`}
                                className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                                onClick={() =>
                                  logProfileSignals({
                                    coachId: coachCard?.id,
                                    coachSlug: coach.slug,
                                    coachName: coach.name,
                                    signals: buildCoachSignals(coach.specialty, coach.sport),
                                  })
                                }
                              >
                                View
                              </Link>
                              <Link
                                href={`/athlete/calendar?coach=${coach.slug}`}
                                className="rounded-full bg-[#b80f0a] px-3 py-1 font-semibold text-white hover:opacity-90 transition-opacity"
                                onClick={() =>
                                  logBookingIntent({
                                    coachId: coachCard?.id,
                                    coachSlug: coach.slug,
                                    coachName: coach.name,
                                    signals: buildCoachSignals(coach.specialty, coach.sport),
                                  })
                                }
                              >
                                Book
                              </Link>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="glass-card border border-[#191919] bg-white p-5 text-sm">
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Grow your network</p>
                    <p className="mt-2 text-lg font-semibold text-[#191919]">Invite a coach or athlete</p>
                    <p className="mt-2 text-sm text-[#4a4a4a]">
                      Invite someone you trust to join Coaches Hive.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={openInviteModal}
                        className="rounded-full bg-[#b80f0a] px-3 py-1 font-semibold text-white hover:opacity-90 transition-opacity"
                      >
                        Send invite
                      </button>
                    </div>
                  </div>
                </section>

              </>
            )}

            {activeTab === 'Sessions' && (
              <section className="glass-card border border-[#191919] bg-white p-5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Sessions</p>
                    <p className="text-lg font-semibold text-[#191919]">Book the next available slot</p>
                  </div>
                  <p className="text-xs text-[#4a4a4a]">Sorted by soonest availability.</p>
                </div>
                <div className="mt-4 space-y-3">
                  {visibleSessions.length === 0 ? (
                    <EmptyState
                      title="No available sessions."
                      description="Try widening your filters or switching to coaches."
                    />
                  ) : (
                    visibleSessions.map(({ coach, slot }) => {
                      const branding = brandMap[coach.id] || {}
                      return (
                        <div key={`${coach.slug}-${slot}`} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[#191919]">{slot}</p>
                              <p className="text-xs text-[#4a4a4a]">{coach.name} • {coach.specialty}</p>
                              <p className="text-xs text-[#4a4a4a]">{coach.location} • {coach.mode}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2 text-xs text-[#4a4a4a]">
                              <span className="text-sm font-semibold text-[#191919]">{coach.price}</span>
                              <Link
                                href={`/athlete/calendar?coach=${coach.slug}`}
                                className="rounded-full bg-[#b80f0a] px-3 py-1 font-semibold text-white hover:opacity-90 transition-opacity"
                                onClick={() =>
                                  logBookingIntent({
                                    coachSlug: coach.slug,
                                    coachName: coach.name,
                                    signals: buildCoachSignals(coach.specialty, coach.sport),
                                  })
                                }
                              >
                                Book
                              </Link>
                              <span className="text-[11px] text-[#4a4a4a]">Open calendar to pick a time and continue booking.</span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
                {availableSessions.length > visibleSessions.length ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleSessionCount((count) => count + 6)}
                      className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                    >
                      Load more sessions
                    </button>
                  </div>
                ) : null}
              </section>
            )}

            {activeTab === 'Orgs/Teams' && (
              <section className="grid gap-4 lg:grid-cols-2">
                <div className="glass-card border border-[#191919] bg-white p-5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Organizations</p>
                      <p className="text-lg font-semibold text-[#191919]">Find programs and clubs</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={orgSearch}
                        onChange={(e) => setOrgSearch(e.target.value)}
                        placeholder="Search orgs"
                        className="rounded-full border border-[#191919] px-3 py-2 text-xs text-[#191919] outline-none"
                      />
                      <select
                        value={orgTypeFilter}
                        onChange={(e) => setOrgTypeFilter(e.target.value)}
                        className="rounded-full border border-[#191919] bg-white px-3 py-2 text-xs text-[#191919]"
                      >
                        <option>All</option>
                        <option>Club</option>
                        <option>League</option>
                        <option>Academy</option>
                        <option>School</option>
                        <option>Program</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {visibleOrgs.length === 0 ? (
                      <EmptyState title="No organizations match." description="Try a different name or org type filter." />
                    ) : (
                      visibleOrgs.map((org) => (
                        <div key={org.name} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#191919]">{org.name}</p>
                              <p className="text-xs text-[#4a4a4a]">{org.location}</p>
                              <p className="text-xs text-[#4a4a4a]">{org.type} • {org.focus}</p>
                            </div>
                            <div className="ml-auto flex w-[150px] shrink-0 flex-col gap-2 text-xs">
                              <Link
                                href={`/organizations/${org.slug}`}
                                className="w-full rounded-full border border-[#191919] px-3 py-1 text-center font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                              >
                                View org
                              </Link>
                              <button
                                type="button"
                                onClick={() => setToast(`Request sent to ${org.name}.`)}
                                className="w-full rounded-full border border-[#b80f0a] bg-[#b80f0a] px-3 py-1 text-center font-semibold text-white hover:opacity-90 transition-opacity"
                              >
                                Request to join
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#4a4a4a]">
                            <span className="rounded-full border border-[#191919] px-2 py-0.5">{org.teams}</span>
                            <span className="rounded-full border border-[#191919] px-2 py-0.5">{org.status}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {filteredOrgs.length > visibleOrgs.length ? (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setVisibleOrgCount((count) => count + 6)}
                        className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        Load more orgs
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="glass-card border border-[#191919] bg-white p-5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Teams</p>
                      <p className="text-lg font-semibold text-[#191919]">Browse active rosters</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={teamSearch}
                        onChange={(e) => setTeamSearch(e.target.value)}
                        placeholder="Search teams"
                        className="rounded-full border border-[#191919] px-3 py-2 text-xs text-[#191919] outline-none"
                      />
                      <select
                        value={teamSportFilter}
                        onChange={(e) => setTeamSportFilter(e.target.value)}
                        className="rounded-full border border-[#191919] bg-white px-3 py-2 text-xs text-[#191919]"
                      >
                        <option>All</option>
                        <option>Track</option>
                        <option>Soccer</option>
                        <option>Basketball</option>
                        <option>Strength</option>
                        <option>Tennis</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {visibleTeams.length === 0 ? (
                      <EmptyState title="No teams match." description="Try a different team name or sport filter." />
                    ) : (
                      visibleTeams.map((team) => (
                        <div key={`${team.orgName}-${team.name}`} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[#191919]">{team.name}</p>
                              <p className="text-xs text-[#4a4a4a]">{team.orgName}</p>
                              <p className="text-xs text-[#4a4a4a]">{team.sport} • {team.level}</p>
                            </div>
                            <div className="ml-auto flex w-[150px] shrink-0 flex-col gap-2 text-xs">
                              <Link
                                href={`/organizations/${team.orgSlug}`}
                                className="w-full rounded-full border border-[#191919] px-3 py-1 text-center font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                              >
                                View org
                              </Link>
                              <button
                                type="button"
                                onClick={() => setToast(`Request sent for ${team.name}.`)}
                                className="w-full rounded-full border border-[#b80f0a] bg-[#b80f0a] px-3 py-1 text-center font-semibold text-white hover:opacity-90 transition-opacity"
                              >
                                Request to join
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#4a4a4a]">
                            <span className="rounded-full border border-[#191919] px-2 py-0.5">{team.season}</span>
                            <span className="rounded-full border border-[#191919] px-2 py-0.5">{team.status}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {filteredTeams.length > visibleTeams.length ? (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setVisibleTeamCount((count) => count + 6)}
                        className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                      >
                        Load more teams
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
      {showInviteModal ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 px-4 py-10">
          <div className="w-full max-w-md rounded-2xl border border-[#191919] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Send invite</p>
                <h2 className="mt-2 text-lg font-semibold text-[#191919]">Invite a coach or athlete</h2>
                <p className="mt-2 text-sm text-[#4a4a4a]">
                  Enter their email and we&apos;ll send them a Coaches Hive invite.
                </p>
              </div>
              <button
                type="button"
                onClick={closeInviteModal}
                aria-label="Close invite"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#191919] text-[#191919] hover:text-[#b80f0a] transition-colors"
              >
                ×
              </button>
            </div>
            <form className="mt-4 space-y-3" onSubmit={handleInviteCoach}>
              <label className="block space-y-1 text-sm text-[#191919]">
                <span className="text-xs font-semibold">Enter email</span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="coach@email.com"
                  className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] focus:border-[#191919] focus:outline-none"
                />
              </label>
              {inviteNotice ? <p className="text-xs text-[#b80f0a]">{inviteNotice}</p> : null}
              <div className="rounded-2xl border border-[#ececec] bg-[#fafafa] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#4a4a4a]">
                  Recent invites
                </p>
                <div className="mt-2 space-y-2 text-xs text-[#4a4a4a]">
                  {recentCoachInvites.length === 0 ? (
                    <p>No coach invites sent yet from this athlete account.</p>
                  ) : (
                    recentCoachInvites.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-[#ececec] bg-white px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#191919]">
                            {invite.email || 'Unknown email'}
                          </p>
                          <p>
                            {invite.created_at
                              ? new Date(invite.created_at).toLocaleString()
                              : 'Recently sent'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-[#191919]">
                            {invite.invite_delivery === 'sent'
                              ? 'Email sent'
                              : invite.invite_delivery === 'queued'
                                ? 'Queued'
                                : invite.invite_delivery === 'skipped'
                                  ? 'Manual follow-up'
                                  : 'Delivery issue'}
                          </p>
                          <p>{invite.status}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 text-sm">
                <button
                  type="button"
                  onClick={closeInviteModal}
                  className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteSending}
                  className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {inviteSending ? 'Sending...' : 'Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </main>
  )
}
