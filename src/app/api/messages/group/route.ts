import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { asSharedSupabaseClient } from '@/lib/sharedSupabaseContract'

export async function POST(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const title = String(body?.title || '').trim()
  const participantIds = Array.isArray(body?.participant_ids)
    ? body.participant_ids.map((value: unknown) => String(value || '')).filter(Boolean)
    : []
  const orgId = body?.org_id ? String(body.org_id) : undefined
  const { data, error } = await asSharedSupabaseClient(supabase).rpc('create_group_thread', {
    p_title: title,
    p_participant_ids: participantIds,
    p_org_id: orgId,
  })
  if (error) return NextResponse.json({ error: 'Unable to create this group conversation.' }, { status: 400 })
  return NextResponse.json({ thread_id: data }, { status: 201 })
}
