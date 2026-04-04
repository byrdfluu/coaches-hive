import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const jsonError = (message: string, status = 400) =>
  NextResponse.json(
    { error: status >= 500 ? 'Internal server error' : message },
    { status },
  )

const ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
] as const
const COACH_ROLES = new Set(['coach', 'assistant_coach'])
const ATHLETE_ROLES = new Set(['athlete'])

type OrgMemberRow = {
  user_id: string
  role: string
}

const getOrgMembership = async (userId: string) => {
  return supabaseAdmin
    .from('organization_memberships')
    .select('org_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .maybeSingle()
}

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const membership = await getOrgMembership(session.user.id)
  const orgId = membership.data?.org_id
  const role = membership.data?.role
  if (!orgId) {
    return jsonError('No organization found', 404)
  }

  if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
    return jsonError('Forbidden', 403)
  }

  const { data: memberRows } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id, role')
    .eq('org_id', orgId)

  const members = (memberRows || []) as OrgMemberRow[]
  const memberIds = members.map((row) => row.user_id)
  const memberRoleMap = new Map<string, string>()
  members.forEach((row) => memberRoleMap.set(row.user_id, row.role))

  const { data: profiles } = memberIds.length
    ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', memberIds)
    : { data: [] }

  const profileMap = new Map<string, { full_name?: string | null; email?: string | null }>()
  ;(profiles || []).forEach((profile) => profileMap.set(profile.id, profile))

  const coaches = members
    .filter((row) => COACH_ROLES.has(row.role))
    .map((row) => ({
      id: row.user_id,
      name: profileMap.get(row.user_id)?.full_name || profileMap.get(row.user_id)?.email || 'Coach',
    }))
  const athletes = members
    .filter((row) => ATHLETE_ROLES.has(row.role))
    .map((row) => ({
      id: row.user_id,
      name: profileMap.get(row.user_id)?.full_name || profileMap.get(row.user_id)?.email || 'Athlete',
    }))

  if (memberIds.length === 0) {
    return NextResponse.json({ threads: [], coaches, athletes })
  }

  const { data: participantRows } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id, user_id')
    .in('user_id', memberIds)

  const threadIds = Array.from(new Set((participantRows || []).map((row) => row.thread_id)))
  if (threadIds.length === 0) {
    return NextResponse.json({ threads: [], coaches, athletes })
  }

  const { data: allParticipants } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id, user_id')
    .in('thread_id', threadIds)

  const { data: threadRows } = await supabaseAdmin
    .from('threads')
    .select('id, title, is_group, created_at')
    .in('id', threadIds)

  const participantsByThread = new Map<string, string[]>()
  ;(allParticipants || []).forEach((row) => {
    const list = participantsByThread.get(row.thread_id) || []
    list.push(row.user_id)
    participantsByThread.set(row.thread_id, list)
  })

  const filteredThreads = (threadRows || []).filter((thread) => {
    if (thread.is_group) return false
    const participantIds = participantsByThread.get(thread.id) || []
    if (participantIds.length !== 2) return false
    if (!participantIds.every((id) => memberRoleMap.has(id))) return false
    const roles = participantIds.map((id) => memberRoleMap.get(id) || '')
    const hasCoach = roles.some((r) => COACH_ROLES.has(r))
    const hasAthlete = roles.some((r) => ATHLETE_ROLES.has(r))
    return hasCoach && hasAthlete
  })

  const relevantThreadIds = filteredThreads.map((thread) => thread.id)
  const { data: messageRows } = relevantThreadIds.length
    ? await supabaseAdmin
        .from('messages')
        .select('id, thread_id, body, content, created_at')
        .in('thread_id', relevantThreadIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  const lastMessageByThread = new Map<string, { body: string; created_at: string }>()
  ;(messageRows || []).forEach((message) => {
    if (!lastMessageByThread.has(message.thread_id)) {
      lastMessageByThread.set(message.thread_id, {
        body: message.body || message.content || '',
        created_at: message.created_at,
      })
    }
  })

  const threads = filteredThreads.map((thread) => {
    const participantIds = participantsByThread.get(thread.id) || []
    const coachId = participantIds.find((id) => COACH_ROLES.has(memberRoleMap.get(id) || '')) || ''
    const athleteId = participantIds.find((id) => ATHLETE_ROLES.has(memberRoleMap.get(id) || '')) || ''
    const last = lastMessageByThread.get(thread.id)
    return {
      id: thread.id,
      coach_id: coachId,
      coach_name: profileMap.get(coachId)?.full_name || profileMap.get(coachId)?.email || 'Coach',
      athlete_id: athleteId,
      athlete_name: profileMap.get(athleteId)?.full_name || profileMap.get(athleteId)?.email || 'Athlete',
      last_message: last?.body || 'Start the conversation',
      last_time: last?.created_at || thread.created_at,
    }
  })

  return NextResponse.json({ threads, coaches, athletes })
}

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return jsonError('Unauthorized', 401)
  }

  const membership = await getOrgMembership(session.user.id)
  const orgId = membership.data?.org_id
  const role = membership.data?.role
  if (!orgId) {
    return jsonError('No organization found', 404)
  }

  if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
    return jsonError('Forbidden', 403)
  }

  const body = await request.json().catch(() => ({}))
  const { coach_id, athlete_id } = body || {}

  if (!coach_id || !athlete_id) {
    return jsonError('coach_id and athlete_id are required')
  }

  const { data: memberRows } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id, role')
    .eq('org_id', orgId)
    .in('user_id', [coach_id, athlete_id])

  const members = (memberRows || []) as OrgMemberRow[]
  const coachMember = members.find((row) => row.user_id === coach_id)
  const athleteMember = members.find((row) => row.user_id === athlete_id)

  if (!coachMember || !athleteMember) {
    return jsonError('Both users must belong to the organization', 400)
  }

  if (!COACH_ROLES.has(coachMember.role) || !ATHLETE_ROLES.has(athleteMember.role)) {
    return jsonError('Select a coach and an athlete for a 1:1 thread', 400)
  }

  const { data: existingParticipantRows } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id, user_id')
    .in('user_id', [coach_id, athlete_id])

  const candidateThreadIds = Array.from(
    new Set((existingParticipantRows || []).map((row) => row.thread_id))
  )

  if (candidateThreadIds.length > 0) {
    const { data: existingThreads } = await supabaseAdmin
      .from('thread_participants')
      .select('thread_id, user_id')
      .in('thread_id', candidateThreadIds)

    const byThread = new Map<string, string[]>()
    ;(existingThreads || []).forEach((row) => {
      const list = byThread.get(row.thread_id) || []
      list.push(row.user_id)
      byThread.set(row.thread_id, list)
    })

    const { data: threadRows } = await supabaseAdmin
      .from('threads')
      .select('id, is_group')
      .in('id', candidateThreadIds)

    const match = (threadRows || []).find((thread) => {
      if (thread.is_group) return false
      const participants = byThread.get(thread.id) || []
      return participants.length === 2 && participants.includes(coach_id) && participants.includes(athlete_id)
    })

    if (match) {
      return NextResponse.json({ thread_id: match.id, existing: true })
    }
  }

  const { data: newThread, error: threadError } = await supabaseAdmin
    .from('threads')
    .insert({ title: null, is_group: false, created_by: session.user.id })
    .select('id')
    .single()

  if (threadError || !newThread) {
    return jsonError(threadError?.message || 'Unable to create thread', 500)
  }

  const { error: participantError } = await supabaseAdmin.from('thread_participants').insert([
    { thread_id: newThread.id, user_id: coach_id },
    { thread_id: newThread.id, user_id: athlete_id },
  ])

  if (participantError) {
    return jsonError(participantError.message, 500)
  }

  return NextResponse.json({ thread_id: newThread.id, existing: false })
}
