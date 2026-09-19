import { NextResponse } from 'next/server'
import { mobileError } from '@/lib/mobilePaymentApi'
import { requireMobileThread } from '@/lib/mobileThreadManagement'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const threadId = (await params).threadId, access = await requireMobileThread(request, threadId)
  if ('response' in access) return access.response
  const { data: messages } = await supabaseAdmin.from('messages').select('id').eq('thread_id', threadId).is('deleted_at', null)
  const ids = (messages || []).map((row) => row.id)
  if (!ids.length) return NextResponse.json({ items: [] })
  const { data, error } = await supabaseAdmin.from('message_attachments')
    .select('id,message_id,file_url,file_name,file_type,file_size,created_at').in('message_id', ids)
    .order('created_at', { ascending: false }).limit(100)
  if (error) return mobileError('Unable to load attachments', 500)
  return NextResponse.json({ items: data || [] })
}
