import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { trackServerFlowEvent, trackServerFlowFailure } from '@/lib/serverFlowTelemetry'
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

  const contentAttempt = await supabaseAdmin
    .from('messages')
    .insert({
      ...basePayload,
      content: params.content,
    })
    .select('id, created_at')
    .single()

  if (!contentAttempt.error || !isMissingMessageColumnError(contentAttempt.error.message)) {
    return contentAttempt
  }

  return supabaseAdmin
    .from('messages')
    .insert({
      ...basePayload,
      body: params.content,
    })
    .select('id, created_at')
    .single()
}

export async function POST(request: Request) {
  const { session, role, error: authError } = await getSessionRole([
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
  if (authError || !session) return authError

  const body = await request.json().catch(() => ({}))
  const { thread_id, body: content, attachment } = body || {}

  if (!thread_id || (!content && !attachment)) {
    trackServerFlowEvent({
      flow: 'message_send',
      step: 'validate',
      status: 'failed',
      userId: session.user.id,
      role,
      metadata: { reason: 'missing_thread_or_content' },
    })
    return jsonError('thread_id and body or attachment are required')
  }

  if (content !== undefined && content !== null) {
    const contentStr = String(content)
    if (contentStr.trim().length === 0 && !attachment) {
      trackServerFlowEvent({
        flow: 'message_send',
        step: 'validate',
        status: 'failed',
        userId: session.user.id,
        role,
        metadata: { reason: 'empty_message_body' },
      })
      return jsonError('Message body cannot be empty', 400)
    }
    if (contentStr.length > 5000) {
      trackServerFlowEvent({
        flow: 'message_send',
        step: 'validate',
        status: 'failed',
        userId: session.user.id,
        role,
        metadata: { reason: 'message_too_long' },
      })
      return jsonError('Message exceeds 5000 characters', 400)
    }
  }

  const userId = session.user.id

  const { data: membership } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id')
    .eq('thread_id', thread_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership) {
    trackServerFlowEvent({
      flow: 'message_send',
      step: 'membership_check',
      status: 'failed',
      userId,
      role,
      entityId: thread_id,
      metadata: { reason: 'not_a_participant' },
    })
    return jsonError('Not a participant', 403)
  }

  if (role === 'athlete') {
    const { data: participants } = await supabaseAdmin
      .from('thread_participants')
      .select('user_id')
      .eq('thread_id', thread_id)

    const participantIds = (participants || []).map((row) => row.user_id)
    if (participantIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, role, email, coach_privacy_settings')
        .in('id', participantIds)

      const athleteEmail = session.user.email || null
      const coachProfiles = (profiles || []).filter((profile) => profile.role === 'coach')
      for (const coach of coachProfiles) {
        const privacy = (coach.coach_privacy_settings || {}) as {
          allowDirectMessages?: boolean
          visibleToAthletes?: boolean
          blockedAthletes?: string
        }
        if (privacy.visibleToAthletes === false || privacy.allowDirectMessages === false) {
          trackServerFlowEvent({
            flow: 'message_send',
            step: 'privacy_check',
            status: 'failed',
            userId,
            role,
            entityId: thread_id,
            metadata: { reason: 'coach_not_accepting_direct_messages' },
          })
          return jsonError('Coach is not accepting direct messages.', 403)
        }
        if (isBlockedAthlete(privacy.blockedAthletes, userId, athleteEmail)) {
          trackServerFlowEvent({
            flow: 'message_send',
            step: 'privacy_check',
            status: 'failed',
            userId,
            role,
            entityId: thread_id,
            metadata: { reason: 'athlete_blocked_by_coach' },
          })
          return jsonError('Coach is not accepting direct messages from this athlete.', 403)
        }
      }
    }
  }

  if (role === 'coach') {
    const { data: participants } = await supabaseAdmin
      .from('thread_participants')
      .select('user_id')
      .eq('thread_id', thread_id)

    const participantIds = (participants || []).map((row) => row.user_id)
    if (participantIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, role, email, athlete_privacy_settings')
        .in('id', participantIds)

      const coachEmail = session.user.email || null
      const athleteProfiles = (profiles || []).filter((profile) => profile.role === 'athlete')
      for (const athlete of athleteProfiles) {
        const privacy = (athlete.athlete_privacy_settings || {}) as {
          allowDirectMessages?: boolean
          blockedCoaches?: string
        }
        if (privacy.allowDirectMessages === false) {
          trackServerFlowEvent({
            flow: 'message_send',
            step: 'privacy_check',
            status: 'failed',
            userId,
            role,
            entityId: thread_id,
            metadata: { reason: 'athlete_not_accepting_direct_messages' },
          })
          return jsonError('Athlete is not accepting direct messages.', 403)
        }
        if (isBlockedCoach(privacy.blockedCoaches, userId, coachEmail)) {
          trackServerFlowEvent({
            flow: 'message_send',
            step: 'privacy_check',
            status: 'failed',
            userId,
            role,
            entityId: thread_id,
            metadata: { reason: 'coach_blocked_by_athlete' },
          })
          return jsonError('Athlete is not accepting direct messages from this coach.', 403)
        }
      }
    }
  }

  trackServerFlowEvent({
    flow: 'message_send',
    step: 'write',
    status: 'started',
    userId,
    role,
    entityId: thread_id,
    metadata: {
      hasAttachment: Boolean(attachment?.path && attachment?.url),
      hasBody: Boolean(content),
    },
  })

  const { data: message, error } = await insertMessageCompat({
    threadId: thread_id,
    senderId: userId,
    content: content,
  })

  if (error || !message) {
    trackServerFlowFailure(error || new Error('Message insert returned no row'), {
      flow: 'message_send',
      step: 'write',
      userId,
      role,
      entityId: thread_id,
      metadata: {
        hasAttachment: Boolean(attachment?.path && attachment?.url),
        hasBody: Boolean(content),
      },
    })
    return jsonError(error?.message || 'Unable to send message', 500)
  }

  if (attachment && attachment.path && attachment.url) {
    const { error: attachmentError } = await supabaseAdmin.from('message_attachments').insert({
      message_id: message.id,
      file_path: attachment.path,
      file_url: attachment.url,
      file_name: attachment.name,
      file_type: attachment.type,
      file_size: attachment.size,
    })

    if (attachmentError) {
      trackServerFlowFailure(attachmentError, {
        flow: 'message_send',
        step: 'attachment_write',
        userId,
        role,
        entityId: message.id,
        metadata: {
          threadId: thread_id,
        },
      })
      return jsonError('Message sent, but the attachment could not be saved.', 500)
    }
  }

  // Parse @mentions and fan out in-app notifications. Fire-and-forget.
  if (content && typeof content === 'string') {
    Promise.resolve().then(async () => {
      try {
        const mentionPattern = /@([A-Za-z]+(?: [A-Za-z]+)?)/g
        const mentionTokens: string[] = []
        let match: RegExpExecArray | null
        while ((match = mentionPattern.exec(content)) !== null) {
          mentionTokens.push(match[1].trim())
        }
        if (mentionTokens.length === 0) return

        // Get thread participants (excluding sender).
        const { data: participantRows } = await supabaseAdmin
          .from('thread_participants')
          .select('user_id')
          .eq('thread_id', thread_id)
        const otherIds = (participantRows || [])
          .map((row) => row.user_id)
          .filter((id) => id !== userId)
        if (otherIds.length === 0) return

        // Look up participants by name to match mentions.
        const { data: participantProfiles } = await supabaseAdmin
          .from('profiles')
          .select('id, full_name, role')
          .in('id', otherIds)

        // Resolve sender name for notification title.
        const { data: senderProfile } = await supabaseAdmin
          .from('profiles')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle()
        const senderName = senderProfile?.full_name || 'Someone'

        const truncatedBody = content.length > 80 ? content.slice(0, 77) + '…' : content
        const notifiedIds = new Set<string>()

        for (const token of mentionTokens) {
          const tokenLower = token.toLowerCase()
          const matched = (participantProfiles || []).find(
            (p) => p.full_name && p.full_name.toLowerCase().startsWith(tokenLower)
          )
          if (!matched || notifiedIds.has(matched.id)) continue
          notifiedIds.add(matched.id)
          const userRole = matched.role || ''
          const actionUrl = userRole === 'athlete' ? '/athlete/messages' : '/coach/messages'
          await supabaseAdmin.from('notifications').insert({
            user_id: matched.id,
            type: 'message_mention',
            title: `${senderName} mentioned you`,
            body: truncatedBody,
            action_url: actionUrl,
            data: { thread_id, message_id: message.id, sender_id: userId, category: 'Messages' },
          })
        }
      } catch {
        // Mention notifications are best-effort; never block the send response.
      }
    })
  }

  trackServerFlowEvent({
    flow: 'message_send',
    step: 'write',
    status: 'succeeded',
    userId,
    role,
    entityId: message.id,
    metadata: {
      threadId: thread_id,
      hasAttachment: Boolean(attachment?.path && attachment?.url),
      hasBody: Boolean(content),
    },
  })

  return NextResponse.json({ id: message.id, created_at: message.created_at })
}
