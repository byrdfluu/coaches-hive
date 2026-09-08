import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { getPlan, normalizePlanKey } from '@/lib/allAccessPricing'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = ['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','team_manager']

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error || !session) return error
  const body = await request.json().catch(() => null)
  const name = String(body?.name || '').trim()
  if (!name) return jsonError('Team name is required', 400)
  const { data: membership } = await supabaseAdmin.from('organization_memberships')
    .select('org_id').eq('user_id', session.user.id).eq('status', 'active').limit(1).maybeSingle()
  if (!membership?.org_id) return jsonError('Organization membership required', 403)

  const [{ data: subscription }, { data: settings }, { count }] = await Promise.all([
    supabaseAdmin.from('platform_subscriptions').select('tier,status').eq('organization_id', membership.org_id)
      .in('status', ['active','trialing']).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('org_settings').select('plan,contract_team_limit').eq('org_id', membership.org_id).maybeSingle(),
    supabaseAdmin.from('org_teams').select('id', { count: 'exact', head: true }).eq('org_id', membership.org_id),
  ])
  const planKey = normalizePlanKey(subscription?.tier || settings?.plan || 'growing_organization', 'org') || 'growing_organization'
  const plan = getPlan(planKey, 'org')!
  const limit = planKey === 'league_enterprise' ? settings?.contract_team_limit ?? null : plan.maxActiveTeams
  const current = count || 0
  if (limit !== null && current >= limit) {
    return NextResponse.json({ error: 'Your plan’s active-team limit has been reached.', code: 'upgrade_required', resource: 'active_teams', plan_key: planKey, limit, current, upgrade_url: '/pricing' }, { status: 409 })
  }
  const allowed = ['sport','age_range','grade_level','level','notes','season_id','location_id'] as const
  const row: Record<string, unknown> = { org_id: membership.org_id, name }
  for (const key of allowed) row[key] = body?.[key] || null
  const { data, error: insertError } = await supabaseAdmin.from('org_teams').insert(row).select('id').single()
  if (insertError) return jsonError(insertError.message === 'upgrade_required' ? 'Your plan’s active-team limit has been reached.' : insertError.message, insertError.message === 'upgrade_required' ? 409 : 500)
  return NextResponse.json({ team: data }, { status: 201 })
}
