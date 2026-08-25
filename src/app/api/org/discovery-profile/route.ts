import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const allowedRoles = ['org_admin','club_admin','travel_admin','school_admin','athletic_director','program_director']
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

async function orgFor(userId: string) {
  return supabaseAdmin.from('organization_memberships').select('org_id, role').eq('user_id', userId).order('created_at').limit(1).maybeSingle()
}

export async function GET() {
  const { session, error } = await getSessionRole(allowedRoles)
  if (error || !session) return error
  const membership = await orgFor(session.user.id)
  if (!membership.data?.org_id) return jsonError('Organization not found', 404)
  const { data, error: queryError } = await supabaseAdmin.from('organizations').select('sport_primary, sports_additional, city, state, zip_code').eq('id', membership.data.org_id).single()
  if (queryError) return jsonError('Unable to load discovery profile', 500)
  return NextResponse.json({ profile: data })
}

export async function PATCH(request: Request) {
  const { session, error } = await getSessionRole(allowedRoles)
  if (error || !session) return error
  const membership = await orgFor(session.user.id)
  if (!membership.data?.org_id) return jsonError('Organization not found', 404)
  const body = await request.json().catch(() => ({}))
  const state = clean(body.state, 2).toUpperCase()
  const zip_code = clean(body.zip_code, 10)
  if (state && !/^[A-Z]{2}$/.test(state)) return jsonError('State must use a two-letter abbreviation')
  if (zip_code && !/^\d{5}$/.test(zip_code)) return jsonError('Enter a five-digit ZIP code')
  const sports = Array.isArray(body.sports_additional) ? Array.from(new Set<string>(body.sports_additional.map((item: unknown) => clean(item, 50)).filter(Boolean))).slice(0, 12) : []
  const updates = { sport_primary: clean(body.sport_primary, 50) || null, sports_additional: sports, city: clean(body.city, 80) || null, state: state || null, zip_code: zip_code || null }
  const { data, error: updateError } = await supabaseAdmin.from('organizations').update(updates).eq('id', membership.data.org_id).select('sport_primary, sports_additional, city, state, zip_code').single()
  if (updateError) return jsonError('Unable to save discovery profile', 500)
  return NextResponse.json({ profile: data })
}
