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
    const { error: messageError } = await supabaseAdmin.from('messages').insert({
      thread_id: newThread.id,
      sender_id: userId,
      content: first_message,
    })

    if (messageError) {
      console.error('[thread] message insert error:', messageError)
      return NextResponse.json({ error: messageError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ thread_id: newThread.id })
}
