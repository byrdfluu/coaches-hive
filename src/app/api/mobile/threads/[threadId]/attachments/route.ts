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
    .select('id,message_id,file_path,file_url,file_name,file_type,file_size,created_at').in('message_id', ids)
    .order('created_at', { ascending: false }).limit(100)
  if (error) return mobileError('Unable to load attachments', 500)
  const items = await Promise.all((data || []).map(async (item) => {
    const path = item.file_path || (!/^https?:\/\//i.test(item.file_url || '') ? item.file_url : null)
    if (!path) return null
    const bucket = path.includes('/messages/') ? 'private-athlete-media' : 'attachments'
    const { data: signed } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 300)
    if (!signed?.signedUrl) return null
    return { ...item, file_path: path, file_url: signed.signedUrl }
  }))
  return NextResponse.json({ items: items.filter(Boolean) })
}
