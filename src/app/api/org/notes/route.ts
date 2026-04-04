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

const resolveProfileName = (
  profiles?: { full_name?: string | null }[] | { full_name?: string | null } | null,
) => {
  if (Array.isArray(profiles)) {
    return profiles[0]?.full_name || 'Org admin'
  }
  return profiles?.full_name || 'Org admin'
}

export async function GET() {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { data, error: dbError } = await supabaseAdmin
    .from('org_notes')
    .select('id, type, team, title, body, tags, shared, created_at, author_id, profiles:author_id(full_name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (dbError) return jsonError('Failed to load notes', 500)

  const notes = (data || []).map((row: {
    id: string
    type: string
    team: string | null
    title: string
    body: string | null
    tags: string[] | null
    shared: boolean
    created_at: string
    author_id: string | null
    profiles?: { full_name?: string | null }[] | { full_name?: string | null } | null
  }) => ({
    id: row.id,
    type: row.type,
    team: row.team || '',
    author: resolveProfileName(row.profiles),
    date: row.created_at,
    title: row.title,
    body: row.body || '',
    tags: row.tags || [],
    shared: Boolean(row.shared),
  }))

  return NextResponse.json({ notes })
}

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const body = await request.json().catch(() => null)
  const { type, team, title, body: noteBody, tags, shared } = body || {}

  if (!title || !String(title).trim()) return jsonError('Title is required')
  if (!noteBody || !String(noteBody).trim()) return jsonError('Note body is required')

  const validTypes = ['team', 'compliance', 'staff']
  const noteType = validTypes.includes(String(type)) ? String(type) : 'team'

  const { data, error: dbError } = await supabaseAdmin
    .from('org_notes')
    .insert({
      org_id: orgId,
      author_id: session.user.id,
      type: noteType,
      team: String(team || '').trim() || 'Team',
      title: String(title).trim(),
      body: String(noteBody).trim(),
      tags: Array.isArray(tags) ? tags : [],
      shared: Boolean(shared),
    })
    .select('id, type, team, title, body, tags, shared, created_at, profiles:author_id(full_name)')
    .single()

  if (dbError) return jsonError('Failed to save note', 500)

  return NextResponse.json({
    note: {
      id: data.id,
      type: data.type,
      team: data.team || '',
      author: resolveProfileName((data as { profiles?: { full_name?: string | null }[] | { full_name?: string | null } | null }).profiles),
      date: data.created_at,
      title: data.title,
      body: data.body || '',
      tags: data.tags || [],
      shared: Boolean(data.shared),
    },
  })
}

export async function PATCH(request: Request) {
  const { session, error } = await getSessionRole(adminRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const body = await request.json().catch(() => null)
  const { id, shared } = body || {}

  if (!id || typeof id !== 'string') return jsonError('Note id is required')

  const { data, error: dbError } = await supabaseAdmin
    .from('org_notes')
    .update({ shared: Boolean(shared), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id')
    .single()

  if (dbError) return jsonError('Failed to update note', 500)
  if (!data) return jsonError('Note not found', 404)

  return NextResponse.json({ ok: true })
}
