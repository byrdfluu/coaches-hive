import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveActiveOrganizationForUser } from '@/lib/activeOrganization'
export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ error: status >= 500 ? 'Internal server error' : message }, { status })

const ADMIN_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
])

const getOrgMembership = async (userId: string) => {
  const context = await resolveActiveOrganizationForUser(userId)
  return { data: context ? { org_id: context.organizationId, role: context.role } : null }
}

export async function GET() {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return jsonError('Unauthorized', 401)

  const { data: membership } = await getOrgMembership(session.user.id)
  if (!membership?.org_id) return jsonError('No organization found', 404)
  if (!ADMIN_ROLES.has(membership.role)) return jsonError('Forbidden', 403)

  const { data: announcements, error } = await supabaseAdmin
    .from('org_announcements')
    .select('id, title, body, audience, created_at')
    .eq('org_id', membership.org_id)
    .order('created_at', { ascending: false })

  if (error) return jsonError(error.message, 500)

  if (!announcements || announcements.length === 0) {
    return NextResponse.json({ announcements: [] })
  }

  // Get read analytics from notifications table.
  const announcementIds = announcements.map((a) => a.id)
  const { data: notifRows } = await supabaseAdmin
    .from('notifications')
    .select('data, read_at')
    .eq('type', 'org_announcement')
    .in('data->>announcement_id', announcementIds)

  const sentByAnnouncement = new Map<string, number>()
  const readByAnnouncement = new Map<string, number>()
  ;(notifRows || []).forEach((row: { data: Record<string, unknown>; read_at: string | null }) => {
    const aid = row.data?.announcement_id as string
    if (!aid) return
    sentByAnnouncement.set(aid, (sentByAnnouncement.get(aid) || 0) + 1)
    if (row.read_at) {
      readByAnnouncement.set(aid, (readByAnnouncement.get(aid) || 0) + 1)
    }
  })

  const result = announcements.map((a) => ({
    ...a,
    total_sent: sentByAnnouncement.get(a.id) || 0,
    total_read: readByAnnouncement.get(a.id) || 0,
  }))

  return NextResponse.json({ announcements: result })
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return jsonError('Unauthorized', 401)

  const { data: membership } = await getOrgMembership(session.user.id)
  if (!membership?.org_id) return jsonError('No organization found', 404)
  if (!ADMIN_ROLES.has(membership.role)) return jsonError('Forbidden', 403)

  const body = await request.json().catch(() => ({}))
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const messageBody = typeof body?.body === 'string' ? body.body.trim() : ''
  const audience = typeof body?.audience === 'string' ? body.audience.trim() : 'All'
  const teamId = typeof body?.team_id === 'string' ? body.team_id.trim() : null

  if (!title) return jsonError('title is required')
  if (!messageBody) return jsonError('body is required')

  const orgId = membership.org_id

  const normalizedAudience = audience.toLowerCase()
  let audienceType = teamId ? 'teams'
    : normalizedAudience.includes('coach') ? 'coaches'
      : normalizedAudience.includes('athlete') || normalizedAudience.includes('parent') ? 'athletes'
        : 'organization'
  let selectedTeamId = teamId
  if (!selectedTeamId && audienceType === 'organization' && normalizedAudience !== 'all' && !normalizedAudience.startsWith('all ')) {
    const { data: matchingTeam } = await supabaseAdmin.from('org_teams').select('id')
      .eq('org_id', orgId).ilike('name', audience).maybeSingle()
    if (matchingTeam?.id) {
      audienceType = 'teams'
      selectedTeamId = matchingTeam.id
    }
  }

  const { data: announcementId, error: sendError } = await (supabase as any).rpc('send_org_announcement', {
    p_org_id: orgId,
    p_title: title,
    p_body: messageBody,
    p_audience: audienceType,
    p_team_ids: selectedTeamId ? [selectedTeamId] : [],
  })
  if (sendError || !announcementId) return jsonError('Unable to create announcement', sendError?.code === '42501' ? 403 : 500)

  const { count } = await supabaseAdmin.from('org_announcement_recipients')
    .select('user_id', { count: 'exact', head: true }).eq('announcement_id', announcementId)
  return NextResponse.json({ announcement_id: announcementId, sent_count: count || 0 })
}
