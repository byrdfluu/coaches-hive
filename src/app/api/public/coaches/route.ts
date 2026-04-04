import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const COACH_ROLES = new Set(['coach', 'assistant_coach'])

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
  const slug = url.searchParams.get('slug')?.trim().toLowerCase() || ''
  const authUsers: Array<{ id: string; email?: string | null; user_metadata?: Record<string, unknown> | null }> = []
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) break
    const users = data?.users || []
    authUsers.push(...users.map((user) => ({
      id: user.id,
      email: user.email || null,
      user_metadata: (user.user_metadata || null) as Record<string, unknown> | null,
    })))
    if (users.length < perPage) break
    page += 1
  }

  const authCoachIds = authUsers.filter((user) => hasCoachAccess(user.user_metadata)).map((user) => user.id)
  const authUserMap = new Map(authUsers.map((user) => [user.id, user] as const))

  const candidateIds = Array.from(new Set(authCoachIds.filter(Boolean))) as string[]

  if (!candidateIds.length) {
    return NextResponse.json(slug ? { coach: null } : { coaches: [] })
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, bio, avatar_url, brand_logo_url, brand_cover_url, brand_primary_color, brand_accent_color, verification_status, coach_seasons, coach_grades, coach_cancel_window, coach_reschedule_window, coach_refund_policy, coach_messaging_hours, coach_auto_reply, coach_silence_outside_hours, integration_settings, coach_profile_settings, coach_privacy_settings')
    .in('id', candidateIds)

  if (error) {
    return NextResponse.json({ error: 'Unable to load coaches.' }, { status: 500 })
  }

  // Batch fetch availability blocks for all coach IDs
  const { data: availabilityData } = await supabaseAdmin
    .from('availability_blocks')
    .select('coach_id, day_of_week, specific_date, start_time, end_time, session_type')
    .in('coach_id', candidateIds)

  const availabilityBlocks: AvailabilityBlock[] = (availabilityData || []) as AvailabilityBlock[]
  const now = new Date()

  const coaches = (data || [])
    .map((profile) => {
      const authUser = authUserMap.get(profile.id)
      const metadataName = String(authUser?.user_metadata?.full_name || '').trim()

      const settings = profile.coach_profile_settings && typeof profile.coach_profile_settings === 'object'
        ? profile.coach_profile_settings as Record<string, unknown>
        : {}
      const rates = settings.rates && typeof settings.rates === 'object'
        ? settings.rates as Record<string, unknown>
        : {}
      const integrations = profile.integration_settings && typeof profile.integration_settings === 'object'
        ? profile.integration_settings as Record<string, unknown>
        : {}

      const mode = deriveCoachMode(settings, integrations)
      const sessionTypes = deriveSessionTypes(rates)
      const availability = deriveAvailability(availabilityBlocks, profile.id, now)
      const nextSlotMinutes = deriveNextSlotMinutes(availabilityBlocks, profile.id, now)

      return {
        ...profile,
        full_name: profile.full_name || metadataName || null,
        mode,
        sessionTypes,
        availability,
        nextSlotMinutes,
      }
    })
    .filter((profile) => Boolean(profile.full_name))

  if (slug) {
    const coach = coaches.find((profile) => profile.full_name && slugify(profile.full_name) === slug) || null
    return NextResponse.json({ coach })
  }

  return NextResponse.json({ coaches })
}
