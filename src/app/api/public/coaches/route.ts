import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const COACH_ROLES = new Set(['coach', 'assistant_coach'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isUuid = (value: string) => UUID_PATTERN.test(value)

const hasCoachAccess = (metadata: Record<string, unknown> | null | undefined) => {
  if (!metadata || typeof metadata !== 'object') return false
  const baseRole = String(metadata.role || '').trim().toLowerCase()
  const activeRole = String(metadata.active_role || '').trim().toLowerCase()
  return COACH_ROLES.has(baseRole) || COACH_ROLES.has(activeRole)
}

type AvailabilityBlock = {
  coach_id: string
  day_of_week: number
  specific_date: string | null
  start_time: string
  end_time: string
  session_type: string | null
}

type CoachProfileRow = {
  id: string
  role?: string | null
  full_name: string | null
  bio?: string | null
  avatar_url?: string | null
  brand_logo_url?: string | null
  brand_cover_url?: string | null
  brand_primary_color?: string | null
  brand_accent_color?: string | null
  verification_status?: string | null
  coach_seasons?: string[] | null
  coach_grades?: string[] | null
  coach_cancel_window?: string | null
  coach_reschedule_window?: string | null
  coach_refund_policy?: string | null
  coach_profile_settings?: Record<string, unknown> | null
  coach_privacy_settings?: Record<string, unknown> | null
  coaching_philosophy?: string | null
  specialties?: string[] | null
  age_groups?: string[] | null
  competition_levels?: string[] | null
  certifications?: string[] | null
  coaching_experience_years?: number | null
  website_url?: string | null
  inquiry_url?: string | null
  availability_summary?: string | null
  achievements?: string[] | null
}

const PUBLIC_PROFILE_SELECT = [
  'id',
  'role',
  'full_name',
  'bio',
  'avatar_url',
  'brand_logo_url',
  'brand_cover_url',
  'brand_primary_color',
  'brand_accent_color',
  'verification_status',
  'coach_seasons',
  'coach_grades',
  'coach_cancel_window',
  'coach_reschedule_window',
  'coach_refund_policy',
  'coach_profile_settings',
  'coach_privacy_settings',
  'coaching_philosophy',
  'specialties',
  'age_groups',
  'competition_levels',
  'certifications',
  'coaching_experience_years',
  'website_url',
  'inquiry_url',
  'availability_summary',
  'achievements',
].join(', ')

const roleLooksLikeCoach = (role: string | null | undefined) => COACH_ROLES.has(String(role || '').trim().toLowerCase())

async function resolveCoachProfileIdFromCoachProfiles(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('coach_profiles')
    .select('id, user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return null
  const row = data as { id?: string | null; user_id?: string | null } | null
  return row?.user_id || row?.id || null
}

async function loadProfilesByIds(ids: string[]): Promise<{ profiles: CoachProfileRow[]; error: unknown | null }> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
  if (!uniqueIds.length) return { profiles: [], error: null }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(PUBLIC_PROFILE_SELECT)
    .in('id', uniqueIds)

  return {
    profiles: ((data || []) as unknown as CoachProfileRow[]).filter((profile) => roleLooksLikeCoach(profile.role)),
    error,
  }
}

function toMinutes(value: string): number | null {
  const [hour, minute] = value.split(':').map((part) => Number.parseInt(part, 10))
  return Number.isNaN(hour) || Number.isNaN(minute) ? null : hour * 60 + minute
}

function deriveCoachMode(
  settings: Record<string, unknown>,
  integrations: Record<string, unknown>,
): string {
  const hasLocation = Boolean(
    settings.location && typeof settings.location === 'string' && (settings.location as string).trim(),
  )
  const connections = integrations.connections && typeof integrations.connections === 'object'
    ? integrations.connections as Record<string, unknown>
    : {}
  const googleConnected = connections.google && typeof connections.google === 'object'
    ? Boolean((connections.google as Record<string, unknown>).connected)
    : false
  const zoomConnected = connections.zoom && typeof connections.zoom === 'object'
    ? Boolean((connections.zoom as Record<string, unknown>).connected)
    : false
  const hasVirtual = googleConnected || zoomConnected
  if (hasLocation && hasVirtual) return 'Hybrid'
  if (hasVirtual) return 'Remote'
  if (hasLocation) return 'In-person'
  return ''
}

function deriveSessionTypes(rates: Record<string, unknown>): string[] {
  const types: string[] = []
  if (rates.oneOnOne && String(rates.oneOnOne).trim()) types.push('1:1')
  if (rates.group && String(rates.group).trim()) types.push('Group')
  if (rates.virtual && String(rates.virtual).trim()) types.push('Virtual')
  if (rates.assessment && String(rates.assessment).trim()) types.push('Assessment')
  return types
}

function deriveAvailability(blocks: AvailabilityBlock[], coachId: string, nowDate: Date): string[] {
  const coachBlocks = blocks.filter((b) => b.coach_id === coachId)
  if (!coachBlocks.length) return []

  const tags = new Set<string>()
  const todayDow = nowDate.getDay()
  const todayStr = nowDate.toISOString().slice(0, 10)

  for (const block of coachBlocks) {
    // Today: specific_date matches today OR day_of_week matches today's day with no specific_date
    const isSpecificToday = block.specific_date === todayStr
    const isRecurringToday = !block.specific_date && block.day_of_week === todayDow
    if (isSpecificToday || isRecurringToday) {
      tags.add('Today')
    }

    // Weekend: recurring block on Saturday (6) or Sunday (0)
    if (!block.specific_date && (block.day_of_week === 0 || block.day_of_week === 6)) {
      tags.add('Weekend')
    }
    // Weekend: specific_date falls on a weekend
    if (block.specific_date) {
      const blockDow = new Date(`${block.specific_date}T00:00:00`).getDay()
      if (blockDow === 0 || blockDow === 6) tags.add('Weekend')
    }

    // Mornings: start_time before 12:00
    const startMinutes = toMinutes(block.start_time)
    if (startMinutes !== null && startMinutes < 12 * 60) {
      tags.add('Mornings')
    }

    // Evenings: start_time at or after 17:00
    if (startMinutes !== null && startMinutes >= 17 * 60) {
      tags.add('Evenings')
    }
  }

  return Array.from(tags)
}

function deriveNextSlotMinutes(blocks: AvailabilityBlock[], coachId: string, now: Date): number {
  const coachBlocks = blocks.filter((b) => b.coach_id === coachId)
  if (!coachBlocks.length) return 999

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const todayDow = now.getDay()
  const todayStr = now.toISOString().slice(0, 10)
  let minDiff = 999

  for (const block of coachBlocks) {
    const startMinutes = toMinutes(block.start_time)
    if (startMinutes === null) continue

    if (block.specific_date) {
      // Specific date block
      if (block.specific_date === todayStr) {
        const diff = startMinutes - nowMinutes
        if (diff >= 0 && diff < minDiff) minDiff = diff
      } else {
        const blockDate = new Date(`${block.specific_date}T00:00:00`)
        if (blockDate > now) {
          const daysUntil = Math.floor((blockDate.getTime() - now.getTime()) / 86400000)
          const diff = daysUntil * 24 * 60 + startMinutes
          if (diff < minDiff) minDiff = diff
        }
      }
    } else {
      // Recurring block by day_of_week
      let daysUntil = (block.day_of_week - todayDow + 7) % 7
      if (daysUntil === 0 && startMinutes <= nowMinutes) daysUntil = 7
      const diff = daysUntil * 24 * 60 + startMinutes
      if (diff < minDiff) minDiff = diff
    }
  }

  return minDiff
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const rawSlug = url.searchParams.get('slug')?.trim() || ''
  const slug = rawSlug.toLowerCase()
  const allowSelfPreview = url.searchParams.get('self') === '1'
  let selfPreviewCoachId: string | null = null

  if (allowSelfPreview) {
    const supabaseClient = await createRouteHandlerClientCompat()
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (user && hasCoachAccess((user.user_metadata || null) as Record<string, unknown> | null)) {
      selfPreviewCoachId = user.id
    }
  }

  let profiles: CoachProfileRow[] = []
  let candidateIds: string[] = []

  if (selfPreviewCoachId) {
    candidateIds = [selfPreviewCoachId]
    const result = await loadProfilesByIds(candidateIds)
    if (result.error) {
      return NextResponse.json({ error: 'Unable to load coaches.' }, { status: 500 })
    }
    profiles = result.profiles
  } else if (slug && isUuid(slug)) {
    const coachProfileId = await resolveCoachProfileIdFromCoachProfiles(slug)
    candidateIds = Array.from(new Set([slug, coachProfileId].filter(Boolean))) as string[]
    const result = await loadProfilesByIds(candidateIds)
    if (result.error) {
      return NextResponse.json({ error: 'Unable to load coaches.' }, { status: 500 })
    }
    profiles = result.profiles
  } else {
    let profileQuery = supabaseAdmin
      .from('profiles')
      .select(PUBLIC_PROFILE_SELECT)
      .in('role', Array.from(COACH_ROLES))

    const { data, error } = await profileQuery

    if (error) {
      return NextResponse.json({ error: 'Unable to load coaches.' }, { status: 500 })
    }
    profiles = ((data || []) as unknown as CoachProfileRow[]).filter((profile) => roleLooksLikeCoach(profile.role))
    candidateIds = profiles.map((profile) => profile.id)
  }

  // Batch fetch availability blocks for all coach IDs
  const { data: availabilityData } = await supabaseAdmin
    .from('availability_blocks')
    .select('coach_id, day_of_week, specific_date, start_time, end_time, session_type')
    .in('coach_id', candidateIds)

  const availabilityBlocks: AvailabilityBlock[] = (availabilityData || []) as AvailabilityBlock[]
  const { data: independentRows } = candidateIds.length ? await supabaseAdmin
    .from('independent_coach_profiles')
    .select('coach_id,is_active,services,training_locations,remote_available,in_person_available,pricing_summary,session_price_cents,group_session_price_cents,camp_price_cents,testimonials')
    .in('coach_id', candidateIds) : { data: [] }
  const independentByCoach = new Map((independentRows || []).map(row => [row.coach_id, row]))
  const now = new Date()

  const coaches = profiles
    .map((profile) => {
      const independent = independentByCoach.get(profile.id) || null
      const mode = independent?.remote_available && independent?.in_person_available
        ? 'Hybrid'
        : independent?.remote_available ? 'Remote' : independent?.in_person_available ? 'In-person' : ''
      const sessionTypes = [
        independent?.session_price_cents ? '1:1' : '',
        independent?.group_session_price_cents ? 'Group' : '',
        independent?.camp_price_cents ? 'Camp' : '',
      ].filter(Boolean)
      const availability = deriveAvailability(availabilityBlocks, profile.id, now)
      const nextSlotMinutes = deriveNextSlotMinutes(availabilityBlocks, profile.id, now)
      const privacy = profile.coach_privacy_settings && typeof profile.coach_privacy_settings === 'object'
        ? profile.coach_privacy_settings as Record<string, unknown>
        : {}
      const legacySettings = profile.coach_profile_settings && typeof profile.coach_profile_settings === 'object'
        ? profile.coach_profile_settings as Record<string, unknown>
        : {}
      const legacyMedia = Array.isArray(legacySettings.media) ? legacySettings.media : []
      const { coach_privacy_settings: _privacySettings,
        coach_profile_settings: _legacyProfileSettings, ...safeProfile } = profile

      return {
        ...safeProfile,
        coach_profile_settings: { media: legacyMedia },
        coach_privacy_settings: {
          visibleToAthletes: privacy.visibleToAthletes !== false,
          allowDirectMessages: privacy.allowDirectMessages !== false,
          showProgressSnapshots: privacy.showProgressSnapshots !== false,
          showRatings: privacy.showRatings !== false,
        },
        independent_profile: independent,
        full_name: profile.full_name || null,
        mode,
        sessionTypes,
        availability,
        nextSlotMinutes,
      }
    })
    .filter((profile) => Boolean(profile.full_name))

  const publiclyVisibleCoaches = selfPreviewCoachId
    ? coaches
    : coaches.filter((profile) => profile.coach_privacy_settings.visibleToAthletes !== false && profile.independent_profile?.is_active !== false)

  if (slug) {
    const coach = isUuid(slug)
      ? publiclyVisibleCoaches.find((profile) => profile.id === slug || candidateIds.includes(profile.id)) || null
      : publiclyVisibleCoaches.find((profile) => profile.full_name && slugify(profile.full_name) === slug) || null
    const matchedProfile = isUuid(slug)
      ? coaches.find((profile) => profile.id === slug || candidateIds.includes(profile.id))
      : coaches.find((profile) => profile.full_name && slugify(profile.full_name) === slug)
    const unavailableReason = matchedProfile?.independent_profile?.is_active === false
      ? 'inactive'
      : matchedProfile ? 'private' : 'not_found'
    return NextResponse.json({ coach, unavailable_reason: coach ? null : unavailableReason })
  }

  return NextResponse.json({ coaches: publiclyVisibleCoaches })
}
