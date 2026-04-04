import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { session, role, error } = await getSessionRole()
  if (error || !session) return error

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()
  const filterRole = searchParams.get('role') || 'athlete'

  if (q.length < 2) {
    return NextResponse.json({ users: [] })
  }

  if (role === 'coach') {
    // Return athletes linked to this coach matching the query
    const { data, error: queryError } = await supabaseAdmin
      .from('coach_athlete_links')
      .select('athlete_id, profiles!coach_athlete_links_athlete_id_fkey(id, full_name, avatar_url)')
      .eq('coach_id', session.user.id)
      .eq('status', 'active')

    if (queryError) {
      return jsonError(queryError.message)
    }

    const pattern = q.toLowerCase()
    const users = (data || [])
      .map((row) => {
        const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
        return p as { id: string; full_name: string; avatar_url: string | null } | null
      })
      .filter((p): p is { id: string; full_name: string; avatar_url: string | null } =>
        Boolean(p && p.full_name && p.full_name.toLowerCase().includes(pattern))
      )
      .slice(0, 10)

    return NextResponse.json({ users })
  }

  if (role === 'admin') {
    // Admins can search all users by role
    const { data, error: queryError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('role', filterRole)
      .ilike('full_name', `%${q}%`)
      .limit(10)

    if (queryError) {
      return jsonError(queryError.message)
    }

    return NextResponse.json({ users: data || [] })
  }

  return jsonError('Forbidden', 403)
}