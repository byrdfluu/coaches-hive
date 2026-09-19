import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { participantRole, requireMobileThread, scopedUserCanJoin, threadAudit } from '@/lib/mobileThreadManagement'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const threadId = (await params).threadId
  const access = await requireMobileThread(request, threadId)
  if ('response' in access) return access.response
  const { data, error } = await supabaseAdmin.from('thread_participants')
    .select('user_id,role,created_at,muted_at,pinned_at,profiles!inner(full_name,avatar_url)')
    .eq('thread_id', threadId).order('created_at')
  if (error) return mobileError('Unable to load participants', 500)
  return NextResponse.json({ items: data || [] })
}

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const threadId = (await params).threadId
  const access = await requireMobileThread(request, threadId)
  if ('response' in access) return access.response
  if (!access.admin) return mobileError('Thread owner or administrator permission required', 403)
  const body = await request.json().catch(() => ({}))
  const userId = String(body.user_id || '').trim()
  if (!userId) return mobileError('user_id is required', 422)
  if (!(await scopedUserCanJoin(access.thread, userId))) return mobileError('User is outside this conversation scope', 403)
  const { data: profile } = await supabaseAdmin.from('profiles').select('id,role').eq('id', userId).maybeSingle()
  if (!profile) return mobileError('User not found', 404)
  const { error } = await supabaseAdmin.from('thread_participants').upsert({
    thread_id: threadId, user_id: userId, role: participantRole(body.role || profile.role),
  }, { onConflict: 'thread_id,user_id' })
  if (error) return mobileError('Unable to add participant', 500)
  await threadAudit(access.user, access.thread, 'thread.participant_added', { user_id: userId })
  return NextResponse.json({ ok: true, user_id: userId }, { status: 201 })
}
