import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { requireMobileThread } from '@/lib/mobileThreadManagement'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const threadId = (await params).threadId, access = await requireMobileThread(request, threadId)
  if ('response' in access) return access.response
  const q = (new URL(request.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return mobileError('q must contain at least 2 characters', 422)
  const { data, error } = await supabaseAdmin.from('messages').select('id,sender_id,content,created_at')
    .eq('thread_id', threadId).ilike('content', `%${q.replace(/[%_]/g, '\\$&')}%`).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(50)
  if (error) return mobileError('Unable to search thread', 500)
  return NextResponse.json({ items: data || [] })
}
