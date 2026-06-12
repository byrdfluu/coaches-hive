import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
]

export async function GET(request: Request) {
  const { session, role, error } = await getSessionRole([
    ...ORG_ADMIN_ROLES,
    'admin',
  ])
  if (error || !session) return error

  const url = new URL(request.url)
  const sport = url.searchParams.get('sport')
  const location = url.searchParams.get('location')
  const name = url.searchParams.get('name')

  let query = supabaseAdmin
    .from('profiles')
    .select('id, full_name, avatar_url, sport, location, bio, verification_status')
    .eq('available_to_orgs', true)
    .eq('verification_status', 'Approved')

  if (sport) {
    query = query.contains('sport', [sport])
  }
  if (location) {
    query = query.ilike('location', `%${location}%`)
  }
  if (name) {
    query = query.ilike('full_name', `%${name}%`)
  }

  query = query.limit(50)

  const { data, error: queryError } = await query
  if (queryError) {
    return jsonError(queryError.message, 500)
  }

  return NextResponse.json({ coaches: data || [] })
}
