import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { requireMobileThread, threadAudit } from '@/lib/mobileThreadManagement'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const threadId = (await params).threadId
  const access = await requireMobileThread(request, threadId)
  if ('response' in access) return access.response
  if (!access.admin) return mobileError('Thread owner or administrator permission required', 403)
  const body = await request.json().catch(() => ({})), updates: Record<string, string> = {}
  if (typeof body.name === 'string' || typeof body.title === 'string') {
    const name = String(body.name ?? body.title).trim()
    if (!name || name.length > 80) return mobileError('Thread name must be 1–80 characters', 422)
    updates.name = name; updates.title = name
  }
  if (typeof body.image_url === 'string') updates.image_url = body.image_url.trim()
  if (!Object.keys(updates).length) return mobileError('No editable fields supplied', 422)
  const { data, error } = await supabaseAdmin.from('threads').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', threadId).select('*').single()
  if (error) return mobileError('Unable to update thread', 500)
  await threadAudit(access.user, access.thread, 'thread.updated', { fields: Object.keys(updates) })
  return NextResponse.json({ thread: data })
}
