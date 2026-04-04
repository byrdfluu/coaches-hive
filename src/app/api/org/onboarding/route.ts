import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


export async function GET(request: Request) {
  const { session, error } = await getSessionRole([
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
    'admin',
  ])
  if (error || !session) return error

  const url = new URL(request.url)
  const orgId = url.searchParams.get('org_id')
  if (!orgId) {
    return jsonError('org_id is required', 400)
  }

  const { data, error: fetchError } = await supabaseAdmin
    .from('org_onboarding')
    .select('org_id, completed_steps, completed_at, updated_at')
    .eq('org_id', orgId)
    .maybeSingle()

  if (fetchError) {
    return jsonError(fetchError.message, 500)
  }

  return NextResponse.json({ onboarding: data || null })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole([
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
    'admin',
  ])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { org_id, completed_steps = [], total_steps = 0 } = body || {}
  if (!org_id || !Array.isArray(completed_steps)) {
    return jsonError('org_id and completed_steps are required', 400)
  }

  const completedAt = total_steps > 0 && completed_steps.length >= total_steps
    ? new Date().toISOString()
    : null

  const { data, error: upsertError } = await supabaseAdmin
    .from('org_onboarding')
    .upsert({
      org_id,
      completed_steps,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    })
    .select('org_id, completed_steps, completed_at, updated_at')
    .maybeSingle()

  if (upsertError) {
    return jsonError(upsertError.message, 500)
  }

  return NextResponse.json({ onboarding: data })
}
