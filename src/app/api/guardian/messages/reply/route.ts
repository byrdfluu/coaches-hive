import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin, hasSupabaseAdminConfig } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['guardian'])
  if (error || !session) return error

  if (!hasSupabaseAdminConfig) return jsonError('Service unavailable', 503)

  const guardianId = session.user.id
  const body = await request.json().catch(() => ({}))
  const threadId = String(body?.thread_id || '').trim()
  const content = String(body?.content || '').trim()

  if (!threadId) return jsonError('thread_id is required', 400)
  if (!content) return jsonError('Message content is required', 400)
  if (content.length > 5000) return jsonError('Message too long (max 5000 characters)', 400)

  // Verify guardian is linked to an athlete in this thread
  const { data: threadParticipants } = await supabaseAdmin
    .from('thread_participants')
    .select('user_id')
    .eq('thread_id', threadId)

  const participantIds = (threadParticipants || []).map((r: { user_id: string }) => r.user_id)

  const { data: links } = await supabaseAdmin
    .from('guardian_athlete_links')
    .select('athlete_id')
    .eq('guardian_user_id', guardianId)
    .eq('status', 'active')
    .in('athlete_id', participantIds.length > 0 ? participantIds : ['__none__'])

  if (!links || links.length === 0) {
    return jsonError('Forbidden', 403)
  }

  // Add guardian as thread participant if not already (so they receive future messages)
  if (!participantIds.includes(guardianId)) {
    await supabaseAdmin
      .from('thread_participants')
      .upsert({ thread_id: threadId, user_id: guardianId }, { onConflict: 'thread_id,user_id', ignoreDuplicates: true })
    // non-fatal — ignore result
  }

  // Insert the message
  const { data: message, error: insertError } = await supabaseAdmin
    .from('messages')
    .insert({ thread_id: threadId, sender_id: guardianId, content })
    .select('id, created_at')
    .single()

  if (insertError || !message) {
    console.error('[guardian/messages/reply] insert error:', insertError?.message ?? 'no row returned')
    return jsonError('Unable to send message', 500)
  }

  return NextResponse.json({ id: message.id, created_at: message.created_at })
}