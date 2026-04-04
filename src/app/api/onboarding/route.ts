import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function GET() {
  const { session, error } = await getSessionRole(['coach', 'athlete', 'guardian', 'admin'])
  if (error || !session) return error

  const { data, error: fetchError } = await supabaseAdmin
    .from('user_onboarding')
    .select('user_id, role, completed_steps, completed_at, updated_at')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (fetchError) {
    return jsonError(fetchError.message, 500)
  }

  return NextResponse.json({ onboarding: data || null })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(['coach', 'athlete', 'guardian', 'admin'])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { role, completed_steps = [], total_steps = 0 } = body || {}

  if (!role || !Array.isArray(completed_steps)) {
    return jsonError('role and completed_steps are required', 400)
  }

  const completedAt = total_steps > 0 && completed_steps.length >= total_steps
    ? new Date().toISOString()
    : null

  const { data, error: upsertError } = await supabaseAdmin
    .from('user_onboarding')
    .upsert({
      user_id: session.user.id,
      role,
      completed_steps,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    })
    .select('user_id, role, completed_steps, completed_at, updated_at')
    .maybeSingle()

  if (upsertError) {
    return jsonError(upsertError.message, 500)
  }

  return NextResponse.json({ onboarding: data })
}
