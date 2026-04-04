import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const adminRoles = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'admin',
]

const resolveOrgId = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.org_id || null
}

export async function GET() {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { data: orgMembers } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id, role')
    .eq('org_id', orgId)

  const coachIds = (orgMembers || [])
    .filter((row) => ['coach', 'assistant_coach'].includes(String(row.role)))
    .map((row) => row.user_id)

  const { data: orgProducts } = await supabaseAdmin
    .from('products')
    .select(
      'id, title, name, price, price_cents, status, coach_id, org_id, type, media_url, inventory_count, shipping_required, shipping_notes, team_id, created_at, updated_at'
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  const { data: coachProducts } = coachIds.length
    ? await supabaseAdmin
        .from('products')
        .select(
          'id, title, name, price, price_cents, status, coach_id, org_id, type, media_url, inventory_count, shipping_required, shipping_notes, team_id, created_at, updated_at'
        )
        .in('coach_id', coachIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  const coachProductIds = (coachProducts || []).map((row) => row.id)
  const orgProductIds = (orgProducts || []).map((row) => row.id)
  const allProductIds = [...coachProductIds, ...orgProductIds]

  const { data: orders } = allProductIds.length
    ? await supabaseAdmin
        .from('orders')
        .select('id, product_id, coach_id, org_id, athlete_id, amount, total, price, status, created_at, fulfillment_status, refund_status')
        .in('product_id', allProductIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  const { data: teamRows } = await supabaseAdmin
    .from('org_teams')
    .select('id, name, coach_id')
    .eq('org_id', orgId)
    .order('name', { ascending: true })

  const teamIds = (teamRows || []).map((row) => row.id)

  const { data: teamMemberRows } = teamIds.length
    ? await supabaseAdmin
        .from('org_team_members')
        .select('team_id, athlete_id')
        .in('team_id', teamIds)
    : { data: [] }

  const athleteIds = Array.from(
    new Set((orders || []).map((order) => order.athlete_id).filter(Boolean))
  ) as string[]

  const { data: athleteRows } = athleteIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', athleteIds)
    : { data: [] }

  const { data: coachRows } = coachIds.length
    ? await supabaseAdmin
        .from('profiles')
        .select('id, full_name')
        .in('id', coachIds)
    : { data: [] }

  const { data: orgSettings } = await supabaseAdmin
    .from('org_settings')
    .select('org_name, stripe_account_id')
    .eq('org_id', orgId)
    .maybeSingle()

  return NextResponse.json({
    orgId,
    orgName: orgSettings?.org_name || null,
    orgStripeConnected: Boolean(orgSettings?.stripe_account_id),
    orgProducts: orgProducts || [],
    coachProducts: coachProducts || [],
    orders: orders || [],
    coaches: coachRows || [],
    teams: teamRows || [],
    teamMembers: teamMemberRows || [],
    athletes: athleteRows || [],
  })
}
