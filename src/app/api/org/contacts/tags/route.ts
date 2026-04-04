import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

const ADMIN_ROLES = [
  'org_admin',
  'club_admin',
  'travel_admin',
  'school_admin',
  'athletic_director',
  'program_director',
  'team_manager',
  'admin',
  'superadmin',
]

export async function POST(request: Request) {
  const { session, error } = await getSessionRole(ADMIN_ROLES)
  if (error || !session) return error

  const body = await request.json().catch(() => ({}))
  const { contact_ids, tags } = body

  if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
    return jsonError('contact_ids is required', 400)
  }
  if (!Array.isArray(tags) || tags.length === 0) {
    return jsonError('tags is required', 400)
  }

  // Verify requesting user belongs to an org and these contacts are in it
  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!membership?.org_id) return jsonError('Organization not found', 404)

  const { data: orgMembers } = await supabaseAdmin
    .from('organization_memberships')
    .select('user_id')
    .eq('org_id', membership.org_id)
    .in('user_id', contact_ids)

  const validIds = (orgMembers || []).map((m) => m.user_id)
  if (validIds.length === 0) return jsonError('No matching contacts found', 404)

  // Fetch existing tags and merge
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, tags')
    .in('id', validIds)

  const updateErrors: string[] = []

  for (const profile of profiles || []) {
    const existing: string[] = Array.isArray(profile.tags) ? profile.tags : []
    const merged = Array.from(new Set([...existing, ...tags]))
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ tags: merged })
      .eq('id', profile.id)
    if (updateErr) updateErrors.push(updateErr.message)
  }

  if (updateErrors.length > 0) {
    return jsonError(updateErrors.join('; '), 500)
  }

  return NextResponse.json({ success: true })
}
