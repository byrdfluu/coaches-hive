import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isPushEnabled } from '@/lib/notificationPrefs'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
] as const

const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

type NamedRow = { id: string; name: string | null }

const pickByName = (query: string, rows: NamedRow[]) => {
  const normalizedQuery = query.trim().toLowerCase()
  const exact = rows.filter((row) => String(row.name || '').trim().toLowerCase() === normalizedQuery)
  if (exact.length === 1) return { row: exact[0], error: null as string | null }
  if (exact.length > 1) {
    return { row: null, error: `Multiple exact matches found for "${query}". Contact support to resolve duplicates.` }
  }
  if (rows.length === 1) return { row: rows[0], error: null as string | null }
  if (rows.length === 0) return { row: null, error: `No organization matched "${query}".` }
  const suggestions = rows.slice(0, 3).map((row) => row.name).filter(Boolean).join(', ')
  return {
    row: null,
    error: `Multiple organizations matched "${query}". Be more specific. Matches: ${suggestions}`,
  }
}

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) return jsonError('Unauthorized', 401)

  const body = await request.json().catch(() => ({}))
  const orgName = String(body?.org_name || '').trim()
  const teamName = String(body?.team_name || '').trim()
  const requestedRole = body?.role === 'assistant_coach' ? 'assistant_coach' : 'coach'

  if (!orgName) return jsonError('org_name is required')

  const { data: orgRows, error: orgLookupError } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .ilike('name', `%${orgName}%`)
    .limit(8)

  if (orgLookupError) return jsonError(orgLookupError.message, 500)

  const pickedOrg = pickByName(orgName, (orgRows || []) as NamedRow[])
  if (!pickedOrg.row) return jsonError(pickedOrg.error || 'Organization not found', 404)

  const organization = pickedOrg.row
  let pickedTeam: NamedRow | null = null
  if (teamName) {
    const { data: teamRows, error: teamLookupError } = await supabaseAdmin
      .from('org_teams')
      .select('id, name')
      .eq('org_id', organization.id)
      .ilike('name', `%${teamName}%`)
      .limit(8)

    if (teamLookupError) return jsonError(teamLookupError.message, 500)

    const teamPick = pickByName(teamName, (teamRows || []) as NamedRow[])
    if (!teamPick.row) return jsonError(teamPick.error || 'Team not found', 404)
    pickedTeam = teamPick.row
  }

  const { data: currentMembership } = await supabaseAdmin
    .from('organization_memberships')
    .select('id, status')
    .eq('org_id', organization.id)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (currentMembership?.status === 'active') {
    return jsonError('You are already an active member of this organization.', 409)
  }
  if (currentMembership?.status === 'suspended') {
    return jsonError('Your org membership is suspended. Ask an admin to restore access.', 409)
  }

  const userEmail = String(session.user.email || '').trim().toLowerCase()
  if (!userEmail) {
    return jsonError('A verified email is required to request org access.', 400)
  }

  const { data: existingByUser } = await supabaseAdmin
    .from('org_invites')
    .select('id, status')
    .eq('org_id', organization.id)
    .eq('invited_user_id', session.user.id)
    .in('status', ['pending', 'awaiting_approval', 'approved'])
    .limit(1)

  const { data: existingByEmail } = userEmail
    ? await supabaseAdmin
        .from('org_invites')
        .select('id, status')
        .eq('org_id', organization.id)
        .ilike('invited_email', userEmail)
        .in('status', ['pending', 'awaiting_approval', 'approved'])
        .limit(1)
    : { data: [] }

  if ((existingByUser && existingByUser.length > 0) || (existingByEmail && existingByEmail.length > 0)) {
    return jsonError('An access request or invite already exists for this organization.', 409)
  }

  const { data: inviteRow, error: inviteError } = await supabaseAdmin
    .from('org_invites')
    .insert({
      org_id: organization.id,
      team_id: pickedTeam?.id || null,
      role: requestedRole,
      invited_email: userEmail,
      invited_user_id: session.user.id,
      invited_by: session.user.id,
      status: 'awaiting_approval',
    })
    .select('id')
    .single()

  if (inviteError || !inviteRow) {
    return jsonError(inviteError?.message || 'Unable to create join request.', 500)
  }

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('full_name, email')
    .eq('id', session.user.id)
    .maybeSingle()
  const coachName = profileRow?.full_name || profileRow?.email || session.user.email || 'Coach'

  const { data: admins } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id, role, status')
    .eq('org_id', organization.id)
    .in('role', ADMIN_ROLES as unknown as string[])

  const notifications = []
  for (const admin of admins || []) {
    if (admin.status === 'suspended') continue
    const { data: prefsRow } = await supabaseAdmin
      .from('profiles')
      .select('notification_prefs')
      .eq('id', admin.user_id)
      .maybeSingle()
    if (!isPushEnabled(prefsRow?.notification_prefs, 'messages')) continue
    notifications.push({
      user_id: admin.user_id,
      type: 'org_invite_approval',
      title: 'Coach access request',
      body: `${coachName} requested access to ${organization.name || 'your organization'}.`,
      action_url: '/org/permissions',
      data: {
        invite_id: inviteRow.id,
        org_id: organization.id,
        team_id: pickedTeam?.id || null,
        role: requestedRole,
        category: 'Messages',
        source: 'coach_org_request',
      },
    })
  }

  if (notifications.length > 0) {
    await supabaseAdmin.from('notifications').insert(notifications)
  }

  return NextResponse.json({
    id: inviteRow.id,
    status: 'awaiting_approval',
    org_name: organization.name,
    team_name: pickedTeam?.name || null,
  })
}
