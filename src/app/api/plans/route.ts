import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgTier } from '@/lib/planRules'
export const dynamic = 'force-dynamic'


export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole([
    'coach',
    'athlete',
    'org_admin',
    'club_admin',
    'travel_admin',
    'school_admin',
    'athletic_director',
    'program_director',
    'team_manager',
  ])
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const { tier } = body || {}

  if (!tier) {
    return jsonError('tier is required')
  }

  if (role === 'coach') {
    const normalizedTier = normalizeCoachTier(tier)
    const { error: upsertError } = await supabaseAdmin
      .from('coach_plans')
      .upsert({ coach_id: session.user.id, tier: normalizedTier }, { onConflict: 'coach_id' })
    if (upsertError) {
      return jsonError(upsertError.message, 500)
    }
    return NextResponse.json({ tier: normalizedTier })
  }

  if (role === 'athlete') {
    const normalizedTier = normalizeAthleteTier(tier)
    const { error: upsertError } = await supabaseAdmin
      .from('athlete_plans')
      .upsert({ athlete_id: session.user.id, tier: normalizedTier }, { onConflict: 'athlete_id' })
    if (upsertError) {
      return jsonError(upsertError.message, 500)
    }
    return NextResponse.json({ tier: normalizedTier })
  }

  if (
    role === 'org_admin' ||
    role === 'club_admin' ||
    role === 'travel_admin' ||
    role === 'school_admin' ||
    role === 'athletic_director' ||
    role === 'program_director' ||
    role === 'team_manager'
  ) {
    const normalizedTier = normalizeOrgTier(tier)
    const userMetadata = session.user.user_metadata || {}

    const { error: userUpdateError } = await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
      user_metadata: {
        ...userMetadata,
        selected_tier: normalizedTier,
      },
    })
    if (userUpdateError) {
      return jsonError(userUpdateError.message, 500)
    }

    const membershipResponse = await supabaseAdmin
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
      .maybeSingle()

    if (membershipResponse.error) {
      return jsonError(membershipResponse.error.message, 500)
    }

    const orgId = membershipResponse.data?.org_id
    if (orgId) {
      const { error: upsertError } = await supabaseAdmin
        .from('org_settings')
        .upsert({ org_id: orgId, plan: normalizedTier }, { onConflict: 'org_id' })
      if (upsertError) {
        return jsonError(upsertError.message, 500)
      }
    }

    return NextResponse.json({ tier: normalizedTier })
  }

  return jsonError('Unsupported role', 400)
}
