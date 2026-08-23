import { NextResponse } from 'next/server'
import { createRouteHandlerClientCompat } from '@/lib/routeHandlerSupabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const jsonError = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

async function requestUser(request: Request) {
  const supabase = await createRouteHandlerClientCompat()
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) return session.user
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token) return null
  // Validate a mobile user's JWT with the request-scoped Supabase auth
  // client. The service-role client is reserved for the authorized database
  // reads below; coupling JWT validation to it caused valid iOS sessions to
  // be rejected when the deployed admin-auth configuration drifted.
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error) return null
  return user || null
}

async function mutate(request: Request, remove: boolean) {
  const user = await requestUser(request)
  if (!user) return jsonError('Unauthorized', 401)
  const body = await request.json().catch(() => ({}))
  const orgId = typeof body?.org_id === 'string' ? body.org_id : ''
  const membershipId = typeof body?.membership_id === 'string' ? body.membership_id : ''
  const role = typeof body?.role === 'string' ? body.role : null
  if (!orgId || !membershipId || (!remove && !role)) return jsonError('org_id, membership_id, and role are required')

  const { data, error } = await supabaseAdmin.rpc('update_org_member_access_atomic', {
    p_actor_id: user.id,
    p_org_id: orgId,
    p_membership_id: membershipId,
    p_role: role,
    p_remove: remove,
  })
  if (error) {
    const forbidden = /administrator access required|cannot remove your own/i.test(error.message)
    return jsonError(error.message, forbidden ? 403 : 400)
  }
  return NextResponse.json(data || { ok: true })
}

export async function GET(request: Request) {
  const user = await requestUser(request)
  if (!user) return jsonError('Unauthorized', 401)

  const orgId = new URL(request.url).searchParams.get('org_id')?.trim() || ''
  if (!orgId) return jsonError('org_id is required')

  const { data: actorMemberships, error: actorError } = await supabaseAdmin
    .from('organization_memberships')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (actorError) return jsonError(actorError.message, 400)
  const allowedRoles = new Set([
    'org_admin', 'club_admin', 'travel_admin', 'school_admin',
    'athletic_director', 'program_director',
  ])
  if (!(actorMemberships || []).some((membership) => allowedRoles.has(membership.role))) {
    return jsonError('Organization administrator access required', 403)
  }

  // `created_at` is the portable membership date across deployed schemas;
  // some older databases do not have a separate `joined_at` column.
  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('organization_memberships')
    .select('id,user_id,role,status,created_at')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  if (membershipError) return jsonError(membershipError.message, 400)
  const userIds = Array.from(new Set((memberships || []).map((membership) => membership.user_id)))
  if (userIds.length === 0) return NextResponse.json({ members: [] })

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id,full_name,email')
    .in('id', userIds)

  if (profileError) return jsonError(profileError.message, 400)
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]))

  return NextResponse.json({
    members: (memberships || []).map((membership) => {
      const profile = profileById.get(membership.user_id)
      return {
        id: membership.id,
        user_id: membership.user_id,
        full_name: profile?.full_name || profile?.email || 'Organization member',
        email: profile?.email || null,
        role: membership.role,
        status: membership.status,
        joined_at: membership.created_at,
      }
    }),
  })
}

export async function PATCH(request: Request) { return mutate(request, false) }
export async function DELETE(request: Request) { return mutate(request, true) }
