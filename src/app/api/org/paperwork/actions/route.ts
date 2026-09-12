import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { asSharedSupabaseClient } from '@/lib/sharedSupabaseContract'

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const recordId = String(body?.record_id || '').trim()
  const recordType = String(body?.record_type || '').trim()
  const action = String(body?.action || '').trim()
  if (!recordId || !recordType) return NextResponse.json({ error: 'record_id and record_type are required.' }, { status: 400 })
  const shared = asSharedSupabaseClient(supabase)
  if (action === 'remind') {
    const { data, error } = await shared.rpc('send_paperwork_reminders', { p_record_id: recordId, p_record_type: recordType })
    if (error) return NextResponse.json({ error: 'You cannot send reminders for this record.' }, { status: 403 })
    return NextResponse.json({ reminded_count: data })
  }
  if (action === 'archive') {
    const { error } = await shared.rpc('archive_paperwork', { p_record_id: recordId, p_record_type: recordType })
    if (error) return NextResponse.json({ error: 'You cannot archive this record.' }, { status: 403 })
    return NextResponse.json({ archived: true })
  }
  return NextResponse.json({ error: 'action must be remind or archive.' }, { status: 400 })
}
