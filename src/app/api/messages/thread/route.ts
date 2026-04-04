import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const isBlockedAthlete = (blockedAthletes: string | undefined, athleteId: string, athleteEmail?: string | null) => {
  if (!blockedAthletes) return false
  const blockedList = blockedAthletes
    .split(/[\n,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  return blockedList.includes(athleteId.toLowerCase()) || (athleteEmail ? blockedList.includes(athleteEmail.toLowerCase()) : false)
}

const isBlockedCoach = (blockedCoaches: string | undefined, coachId: string, coachEmail?: string | null) => {
  if (!blockedCoaches) return false
  const blockedList = blockedCoaches
    .split(/[\n,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  return blockedList.includes(coachId.toLowerCase()) || (coachEmail ? blockedList.includes(coachEmail.toLowerCase()) : false)
}

const isMissingMessageColumnError = (message?: string | null) =>
  /column .* does not exist|could not find the '.*' column/i.test(String(message || ''))

const insertMessageCompat = async (params: {
  threadId: string
  senderId: string
  content: string
}) => {
  const basePayload = {
    thread_id: params.threadId,
    sender_id: params.senderId,
  }

  const contentResult = await supabaseAdmin.from('messages').insert({
    ...basePayload,
    content: params.content,
  })

  if (!contentResult.error || !isMissingMessageColumnError(contentResult.error.message)) {
    return contentResult
  }

  return supabaseAdmin.from('messages').insert({
    ...basePayload,
    body: params.content,
  })
}

const findExistingDirectThread = async (participantIds: string[]) => {
  if (participantIds.length !== 2) return null

  const { data: candidateMembershipRows } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id, user_id')
    .in('user_id', participantIds)

  if (!candidateMembershipRows || candidateMembershipRows.length === 0) return null

  const matchedCounts = new Map<string, Set<string>>()
  candidateMembershipRows.forEach((row) => {
    const set = matchedCounts.get(row.thread_id) || new Set<string>()
    set.add(row.user_id)
    matchedCounts.set(row.thread_id, set)
  })

  const candidateThreadIds = Array.from(matchedCounts.entries())
    .filter(([, set]) => set.size === participantIds.length)
    .map(([threadId]) => threadId)

  if (candidateThreadIds.length === 0) return null

  const { data: threads } = await supabaseAdmin
    .from('threads')
    .select('id, title, is_group, created_at')
    .eq('is_group', false)
    .in('id', candidateThreadIds)
    .order('created_at', { ascending: false })

  if (!threads || threads.length === 0) return null

  const { data: allParticipantRows } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id, user_id')
    .in('thread_id', threads.map((thread) => thread.id))

  const desiredSet = new Set(participantIds)
  const participantsByThread = new Map<string, Set<string>>()
  ;(allParticipantRows || []).forEach((row) => {
    const set = participantsByThread.get(row.thread_id) || new Set<string>()
    set.add(row.user_id)
    participantsByThread.set(row.thread_id, set)
  })

  for (const thread of threads) {
    const set = participantsByThread.get(thread.id) || new Set<string>()
    if (set.size !== desiredSet.size) continue
    let matches = true
    desiredSet.forEach((id) => {
      if (!set.has(id)) matches = false
    })
    if (matches) {
      return {
        thread_id: thread.id,
        title: thread.title || null,
      }
    }
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
  const { title, is_group = false, participant_ids = [], first_message } = body || {}

  if (!title) {
    return jsonError('title is required')
  }

  const userId = session.user.id
  const participantSet = new Set([userId, ...(participant_ids || [])])
  const participantIds = Array.from(participantSet)

  if (role === 'athlete') {
    const { data: participants } = await supabaseAdmin
      .from('profiles')
      .select('id, role, email, coach_privacy_settings')
      .in('id', participantIds)

    const athleteEmail = session.user.email || null
    const coachProfiles = (participants || []).filter((profile) => profile.role === 'coach')
    for (const coach of coachProfiles) {
      const privacy = (coach.coach_privacy_settings || {}) as {
        allowDirectMessages?: boolean
        visibleToAthletes?: boolean
        blockedAthletes?: string
      }
      if (privacy.visibleToAthletes === false || privacy.allowDirectMessages === false) {
        return jsonError('Coach is not accepting direct messages.', 403)
      }
      if (isBlockedAthlete(privacy.blockedAthletes, userId, athleteEmail)) {
        return jsonError('Coach is not accepting direct messages from this athlete.', 403)
      }
    }
  }

  if (role === 'coach') {
    const { data: participants } = await supabaseAdmin
      .from('profiles')
      .select('id, role, email, athlete_privacy_settings')
      .in('id', participantIds)

    const coachEmail = session.user.email || null
    const athleteProfiles = (participants || []).filter((profile) => profile.role === 'athlete')
    for (const athlete of athleteProfiles) {
      const privacy = (athlete.athlete_privacy_settings || {}) as {
        allowDirectMessages?: boolean
        blockedCoaches?: string
      }
      if (privacy.allowDirectMessages === false) {
        return jsonError('Athlete is not accepting direct messages.', 403)
      }
      if (isBlockedCoach(privacy.blockedCoaches, userId, coachEmail)) {
        return jsonError('Athlete is not accepting direct messages from this coach.', 403)
      }
    }
  }

  if (!is_group) {
    const existingThread = await findExistingDirectThread(participantIds)
    if (existingThread) {
      if (first_message) {
        const { error: messageError } = await insertMessageCompat({
          threadId: existingThread.thread_id,
          senderId: userId,
          content: first_message,
        })

        if (messageError) {
          console.error('[thread] existing thread message insert error:', messageError)
          return NextResponse.json({ error: messageError.message }, { status: 500 })
        }
      }

      return NextResponse.json(existingThread)
    }
  }

  const { data: newThread, error: threadError } = await supabaseAdmin
    .from('threads')
    .insert({ title, is_group, created_by: userId })
    .select('id')
    .single()

  if (threadError || !newThread) {
    console.error('[thread] thread insert error:', threadError)
    return NextResponse.json({ error: threadError?.message || 'Unable to create thread' }, { status: 500 })
  }

  const participants = Array.from(participantSet).map((id) => ({
    thread_id: newThread.id,
    user_id: id,
  }))

  const { error: participantError } = await supabaseAdmin
    .from('thread_participants')
    .insert(participants)

  if (participantError) {
    console.error('[thread] participant insert error:', participantError)
    return NextResponse.json({ error: participantError.message }, { status: 500 })
  }

  if (first_message) {
    const { error: messageError } = await insertMessageCompat({
      threadId: newThread.id,
      senderId: userId,
      content: first_message,
    })

    if (messageError) {
      console.error('[thread] message insert error:', messageError)
      return NextResponse.json({ error: messageError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ thread_id: newThread.id, title })
}
