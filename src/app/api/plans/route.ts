import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeAthleteTier, normalizeCoachTier, normalizeOrgTier } from '@/lib/planRules'
export const dynamic = 'force-dynamic'

const buildSelectedTierMetadata = ({
  metadata,
  tier,
}: {
  metadata: Record<string, any>
  tier: string
}) => ({
  ...metadata,
  selected_tier: tier,
  lifecycle_state: 'plan_selected',
  lifecycle_updated_at: new Date().toISOString(),
})

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
    const currentMetadata = (session.user.user_metadata || {}) as Record<string, any>
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
      user_metadata: buildSelectedTierMetadata({ metadata: currentMetadata, tier: normalizedTier }),
    })
    if (updateError) return jsonError(updateError.message, 500)
    return NextResponse.json({ tier: normalizedTier })
  }

  if (role === 'athlete') {
    const normalizedTier = normalizeAthleteTier(tier)
    const currentMetadata = (session.user.user_metadata || {}) as Record<string, any>
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
      user_metadata: buildSelectedTierMetadata({ metadata: currentMetadata, tier: normalizedTier }),
    })
    if (updateError) return jsonError(updateError.message, 500)
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
    const userMetadata = (session.user.user_metadata || {}) as Record<string, any>

    const { error: userUpdateError } = await supabaseAdmin.auth.admin.updateUserById(session.user.id, {
      user_metadata: buildSelectedTierMetadata({ metadata: userMetadata, tier: normalizedTier }),
    })
    if (userUpdateError) {
      return jsonError(userUpdateError.message, 500)
    }

    return NextResponse.json({ tier: normalizedTier })
  }

  return jsonError('Unsupported role', 400)
}
