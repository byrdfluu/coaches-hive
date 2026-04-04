import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
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

const getOrgMembership = async (userId: string) =>
  supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .maybeSingle()

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
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
  const supabase = createRouteHandlerClient({ cookies })
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

  // Insert announcement.
  const { data: announcement, error: insertError } = await supabaseAdmin
    .from('org_announcements')
    .insert({ org_id: orgId, title, body: messageBody, audience, created_by: session.user.id })
    .select('id')
    .single()

  if (insertError || !announcement) return jsonError(insertError?.message || 'Unable to create announcement', 500)

  // Resolve target member IDs.
  let targetIds: string[] = []

  if (teamId) {
    const { data: teamMembers } = await supabaseAdmin
      .from('org_team_members')
      .select('user_id')
      .eq('team_id', teamId)
    targetIds = (teamMembers || []).map((row) => row.user_id)
  } else {
    const { data: orgMembers } = await supabaseAdmin
      .from('organization_memberships')
      .select('user_id, role')
      .eq('org_id', orgId)
    targetIds = (orgMembers || []).map((row) => row.user_id)
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ announcement_id: announcement.id, sent_count: 0 })
  }

  // Resolve each member's role so we can set the right action_url.
  const { data: profileRows } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .in('id', targetIds)
  const roleMap = new Map<string, string>()
  ;(profileRows || []).forEach((p: { id: string; role: string | null }) => {
    if (p.role) roleMap.set(p.id, p.role)
  })

  const truncatedBody = messageBody.length > 120 ? messageBody.slice(0, 117) + '…' : messageBody

  const notifications = targetIds.map((userId) => {
    const userRole = roleMap.get(userId) || ''
    const actionUrl = userRole === 'athlete' ? '/athlete/dashboard' : '/coach/dashboard'
    return {
      user_id: userId,
      type: 'org_announcement',
      title,
      body: truncatedBody,
      action_url: actionUrl,
      data: { announcement_id: announcement.id, org_id: orgId, category: 'Messages' },
    }
  })

  // Fan out in batches of 100 to stay within Supabase insert limits.
  const batchSize = 100
  for (let i = 0; i < notifications.length; i += batchSize) {
    await supabaseAdmin.from('notifications').insert(notifications.slice(i, i + batchSize))
  }

  return NextResponse.json({ announcement_id: announcement.id, sent_count: targetIds.length })
}
