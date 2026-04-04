import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { error } = await getSessionRole(['athlete'])
  if (error) return error

  const url = new URL(request.url)
  const search = url.searchParams.get('search')?.trim() || ''

  let query = supabaseAdmin
    .from('profiles')
    .select('id, full_name, avatar_url, integration_settings, coach_profile_settings')
    .eq('role', 'coach')
    .order('full_name')

  if (search) {
    query = query.ilike('full_name', `%${search}%`)
  }

  const { data, error: dbError } = await query

  if (dbError) return jsonError('Unable to load coaches.', 500)

  const coaches = (data || []).filter((row) => Boolean(row.full_name))

  return NextResponse.json({ coaches })
}
