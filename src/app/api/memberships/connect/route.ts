import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(['athlete', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { coach_id } = body || {}

  if (!coach_id) {
    return jsonError('coach_id is required')
  }

  const payload = {
    coach_id,
    athlete_id: session.user.id,
    status: 'active',
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('coach_athlete_links')
    .upsert(payload, { onConflict: 'coach_id,athlete_id' })
    .select()
    .single()

  if (insertError) {
    return jsonError(insertError.message)
  }

  return NextResponse.json({ link: data })
}
