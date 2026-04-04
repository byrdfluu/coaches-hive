import { NextResponse } from 'next/server'
import { getSessionRole } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const ALLOWED_ROLES = [
  'coach',
  'athlete',
  'admin',
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
]

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ALLOWED_ROLES)
  if (error || !session) return error

  const body = await request.json().catch(() => null)
  const names = Array.isArray(body?.names) ? body.names : []

  if (names.length === 0) {
    return NextResponse.json({ ids: [], unresolved: [] })
  }

  const ids: string[] = []
  const unresolved: string[] = []

  for (const rawName of names) {
    const name = String(rawName || '').trim()
    if (!name) continue

    const { data: matches } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .ilike('full_name', `%${name}%`)
      .limit(5)

    if (!matches || matches.length === 0) {
      unresolved.push(name)
      continue
    }

    const exact = matches.find(
      (profile) => String(profile.full_name || '').toLowerCase() === name.toLowerCase()
    )
    if (exact) {
      ids.push(exact.id)
      continue
    }

    if (matches.length === 1) {
      ids.push(matches[0].id)
      continue
    }

    unresolved.push(name)
  }

  return NextResponse.json({ ids, unresolved })
}
