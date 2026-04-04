import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'


const allowedRoles = [
  'admin',
  'org_admin',
  'school_admin',
  'athletic_director',
  'club_admin',
  'travel_admin',
  'program_director',
  'team_manager',
]

const resolveOrgId = async (userId: string) => {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.org_id || null
}

export async function GET(request: Request) {
  const { session, error } = await getSessionRole(allowedRoles)
  if (error || !session) return error

  const orgId = await resolveOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found.', 404)

  const { searchParams } = new URL(request.url)
  const limitParam = Number(searchParams.get('limit') || 200)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 200

  const { data, error: fetchError } = await supabaseAdmin
    .from('org_audit_log')
    .select('id, org_id, actor_id, actor_email, action, target_type, target_id, metadata, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (fetchError) return jsonError(fetchError.message, 500)

  return NextResponse.json({ logs: data || [] })
}
