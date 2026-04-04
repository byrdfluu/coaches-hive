import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const ADMIN_ROLES = new Set([
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'admin',
])
const COACH_ROLES = new Set(['coach', 'assistant_coach'])
const ATHLETE_ROLES = new Set(['athlete'])

const getOrgMembership = async (userId: string) => {
  return supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .maybeSingle()
}

const getOrgAdmins = async (orgId: string) => {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id, role')
    .eq('org_id', orgId)
  return (data || [])
    .filter((row) => ADMIN_ROLES.has(String(row.role)))
    .map((row) => row.user_id)
}

const findExistingThread = async (title: string, participantIds: string[]) => {
  const { data: threadRows } = await supabaseAdmin
    .from('threads')
    .select('id, title, is_group')
    .eq('is_group', true)
    .eq('title', title)

  if (!threadRows || threadRows.length === 0) return null

  const threadIds = threadRows.map((thread) => thread.id)
  const { data: participantRows } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id, user_id')
    .in('thread_id', threadIds)

  const participantsByThread = new Map<string, Set<string>>()
  ;(participantRows || []).forEach((row) => {
    const list = participantsByThread.get(row.thread_id) || new Set<string>()
    list.add(row.user_id)
    participantsByThread.set(row.thread_id, list)
  })

  const desiredSet = new Set(participantIds)

  for (const threadId of threadIds) {
    const set = participantsByThread.get(threadId) || new Set<string>()
    if (set.size !== desiredSet.size) continue
    let matches = true
    desiredSet.forEach((id) => {
      if (!set.has(id)) matches = false
    })
    if (matches) return threadId
  }

  return null
}

export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole([
    'coach',
    'athlete',
    'admin',
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
  ])
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const { target, org_id, team_id, recipient_id, first_message } = body || {}
  if (target !== 'org' && target !== 'team') {
    return jsonError('target must be org or team')
  }

  const userId = session.user.id

  const isPlatformAdmin = role === 'admin'

  if (target === 'org') {
    const membership = await getOrgMembership(userId)
    const orgId = org_id || membership.data?.org_id
    if (!orgId) return jsonError('org_id is required', 400)
    if (!isPlatformAdmin) {
      if (!membership.data?.org_id) {
        return jsonError('No organization membership found', 403)
      }
      if (membership.data?.org_id !== orgId) {
        return jsonError('Forbidden', 403)
      }
    }

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .maybeSingle()

    if (!org) return jsonError('Organization not found', 404)

    if (recipient_id) {
      const { data: recipient } = await supabaseAdmin
        .from('organization_memberships')
        .select('user_id, role')
        .eq('org_id', orgId)
        .eq('user_id', recipient_id)
        .maybeSingle()

      if (!recipient) {
        return jsonError('Recipient must belong to the organization', 400)
      }
    }

    const adminIds = await getOrgAdmins(orgId)
    const participants = Array.from(new Set([userId, recipient_id, ...adminIds].filter(Boolean)))
    const title = `Org: ${org.name}`

    const existingThreadId = await findExistingThread(title, participants)
    if (existingThreadId) {
      return NextResponse.json({ thread_id: existingThreadId, title })
    }

    const { data: newThread, error: threadError } = await supabaseAdmin
      .from('threads')
      .insert({ title, is_group: true, created_by: userId })
      .select('id')
      .single()

    if (threadError || !newThread) {
      return jsonError(threadError?.message || 'Unable to create thread', 500)
    }

    const participantRows = participants.map((id) => ({
      thread_id: newThread.id,
      user_id: id,
    }))

    const { error: participantError } = await supabaseAdmin
      .from('thread_participants')
      .insert(participantRows)

    if (participantError) {
      return jsonError(participantError.message, 500)
    }

    if (first_message) {
      const { error: messageError } = await supabaseAdmin.from('messages').insert({
        thread_id: newThread.id,
        sender_id: userId,
        content: first_message,
      })
      if (messageError) {
        return jsonError(messageError.message, 500)
      }
    }

    return NextResponse.json({ thread_id: newThread.id, title })
  }

  if (!team_id) {
    return jsonError('team_id is required')
  }

  const { data: team } = await supabaseAdmin
    .from('org_teams')
    .select('id, name, org_id, coach_id')
    .eq('id', team_id)
    .maybeSingle()

  if (!team?.org_id) return jsonError('Team not found', 404)

  const membership = await getOrgMembership(userId)
  const orgId = membership.data?.org_id
  const membershipRole = membership.data?.role
  if (!isPlatformAdmin) {
    if (!orgId || orgId !== team.org_id) {
      return jsonError('Forbidden', 403)
    }
  }

  const { data: teamMembers } = await supabaseAdmin
    .from('org_team_members')
    .select('athlete_id')
    .eq('team_id', team_id)

  const athleteIds = (teamMembers || []).map((row) => row.athlete_id).filter(Boolean)
  if (!isPlatformAdmin) {
    const isAdmin = ADMIN_ROLES.has(String(membershipRole))
    const isCoach = COACH_ROLES.has(String(membershipRole)) && team.coach_id === userId
    const isAthlete = ATHLETE_ROLES.has(String(membershipRole)) && athleteIds.includes(userId)

    if (!isAdmin && !isCoach && !isAthlete) {
      return jsonError('You must belong to this team to message it', 403)
    }
  }

  const adminIds = await getOrgAdmins(team.org_id)
  const participants = Array.from(
    new Set([team.coach_id, ...athleteIds, ...adminIds, userId].filter(Boolean))
  )
  const title = `Team: ${team.name || 'Team'}`

  const existingThreadId = await findExistingThread(title, participants)
  if (existingThreadId) {
    return NextResponse.json({ thread_id: existingThreadId, title })
  }

  const { data: newThread, error: threadError } = await supabaseAdmin
    .from('threads')
    .insert({ title, is_group: true, created_by: userId })
    .select('id')
    .single()

  if (threadError || !newThread) {
    return jsonError(threadError?.message || 'Unable to create thread', 500)
  }

  const participantRows = participants.map((id) => ({
    thread_id: newThread.id,
    user_id: id,
  }))

  const { error: participantError } = await supabaseAdmin
    .from('thread_participants')
    .insert(participantRows)

  if (participantError) {
    return jsonError(participantError.message, 500)
  }

  if (first_message) {
    const { error: messageError } = await supabaseAdmin.from('messages').insert({
      thread_id: newThread.id,
      sender_id: userId,
      body: first_message,
    })
    if (messageError) {
      return jsonError(messageError.message, 500)
    }
  }

  return NextResponse.json({ thread_id: newThread.id, title })
}
