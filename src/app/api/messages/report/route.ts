import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const REPORT_REASONS = new Set(['harassment', 'inappropriate', 'spam', 'safety', 'other'])

export async function POST(request: Request) {
  const { session, error } = await getSessionRole([
    'coach', 'athlete', 'admin', 'org_admin', 'club_admin', 'travel_admin',
    'school_admin', 'athletic_director', 'program_director', 'team_manager',
  ])
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const threadId = String(body?.thread_id || '').trim()
  const reason = String(body?.reason || '').trim().toLowerCase()
  const details = String(body?.details || '').trim()
  if (!threadId) return jsonError('thread_id is required')
  if (!REPORT_REASONS.has(reason)) return jsonError('Choose a valid report reason')
  if (details.length > 10_000) return jsonError('Details must be 10000 characters or fewer')

  const reporterId = session.user.id
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('thread_participants')
    .select('thread_id')
    .eq('thread_id', threadId)
    .eq('user_id', reporterId)
    .maybeSingle()
  if (membershipError) return jsonError('Unable to verify conversation access', 500)
  if (!membership) return jsonError('Conversation access required', 403)

  const [{ data: latestMessage, error: messageError }, { data: participants, error: participantError }] = await Promise.all([
    supabaseAdmin
      .from('messages')
      .select('id, sender_id')
      .eq('thread_id', threadId)
      .neq('sender_id', reporterId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('thread_participants')
      .select('user_id')
      .eq('thread_id', threadId)
      .neq('user_id', reporterId)
      .order('created_at', { ascending: true })
      .limit(1),
  ])
  if (messageError || participantError) return jsonError('Unable to resolve report context', 500)
  const reportedUserId = latestMessage?.sender_id || participants?.[0]?.user_id || null

  const { data: report, error: reportError } = await supabaseAdmin
    .from('content_reports')
    .insert({
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      content_type: 'message',
      content_id: latestMessage?.id || null,
      thread_id: threadId,
      reason,
      details: details || null,
      status: 'open',
    })
    .select('id, status')
    .single()
  if (reportError || !report) return jsonError(reportError?.message || 'Unable to submit report', 500)
  return NextResponse.json({ report })
}
