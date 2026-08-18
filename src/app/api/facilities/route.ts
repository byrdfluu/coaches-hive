import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { loadStripeConnectAccountStatus } from '@/lib/stripeConnectAccounts'

export async function GET() {
  const { data, error } = await supabaseAdmin.from('facilities').select('*, facility_spaces(*)').eq('active', true).order('name')
  if (error) return jsonError(error.message, 500)
  return NextResponse.json({ facilities: data || [] })
}
export async function POST(request: Request) {
  const { session, role, error } = await getSessionRole(['coach','org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director','admin'])
  if (error || !session) return error
  const body = await request.json().catch(() => ({}))
  if (!String(body.name || '').trim()) return jsonError('name is required')
  let orgId: string | null = null
  if (role !== 'coach') { const { data } = await supabaseAdmin.from('organization_memberships').select('org_id').eq('user_id', session.user.id).maybeSingle(); orgId = data?.org_id || null }
  const connect = await loadStripeConnectAccountStatus(orgId ? 'org' : 'coach', orgId || session.user.id)
  const { data: facility, error: dbError } = await supabaseAdmin.from('facilities').insert({
    owner_user_id: session.user.id, org_id: orgId, stripe_account_id: connect?.stripeAccountId || null,
    name: String(body.name).trim(), description: body.description || null, address: body.address || null,
    cancellation_policy: body.cancellation_policy || null, minimum_minutes: Math.max(1, Math.round(Number(body.minimum_minutes || 60))),
    advance_notice_hours: Math.max(0, Math.round(Number(body.advance_notice_hours || 24))),
    marketplace_fee_rate: Number(body.marketplace_fee_rate ?? 0.10), marketplace_fee_cap_cents: Math.round(Number(body.marketplace_fee_cap_cents ?? 7500)),
  }).select('*').single()
  if (dbError) return jsonError(dbError.message, 500)
  const spaces = Array.isArray(body.spaces) ? body.spaces.filter((space: any) => String(space?.name || '').trim() && Number(space?.hourly_rate_cents) > 0) : []
  if (spaces.length) await supabaseAdmin.from('facility_spaces').insert(spaces.map((space: any) => ({ facility_id: facility.id, name: String(space.name).trim(), hourly_rate_cents: Math.round(Number(space.hourly_rate_cents)), metadata: space.metadata || {} })))
  return NextResponse.json({ facility, spaces_created: spaces.length }, { status: 201 })
}
